package dynamicclose

import (
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// fakeDynIdx is a minimal DynamicIndexWriter stub.
type fakeDynIdx struct {
	count       uint64
	closeReturn [32]byte
	closeErr    error
}

func (f *fakeDynIdx) AddChunk(_ uint64, _ [32]byte) error { f.count++; return nil }
func (f *fakeDynIdx) IndexLength() uint64                 { return f.count }
func (f *fakeDynIdx) Close() ([32]byte, error)            { return f.closeReturn, f.closeErr }
func (f *fakeDynIdx) UUID() [16]byte                      { return [16]byte{} }
func (f *fakeDynIdx) Drop()                               {}

func makeState(t *testing.T) (*wstate.State, int, *fakeDynIdx) {
	t.Helper()
	fi := &fakeDynIdx{}
	ws := wstate.New()
	wid, err := ws.RegisterDynamicWriter("test.didx", fi)
	if err != nil {
		t.Fatalf("RegisterDynamicWriter: %v", err)
	}
	return ws, wid, fi
}

func makeSessionCtx(ws *wstate.State) *streamctx.SessionContext {
	return &streamctx.SessionContext{
		SessionID:   "test-session",
		BackupType:  "vm",
		BackupID:    "100",
		BackupTime:  time.Unix(1735000000, 0).UTC(),
		WriterState: ws,
	}
}

func injectCtx(sc *streamctx.SessionContext) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
		})
	}
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	ws, _, _ := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	req := httptest.NewRequest(http.MethodGet, "/dynamic_close", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_MissingWid_Returns400(t *testing.T) {
	ws, _, _ := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	req := httptest.NewRequest(http.MethodPost, "/dynamic_close?chunk-count=0&size=0&csum="+strings.Repeat("00", 32), nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_MissingSize_Returns400(t *testing.T) {
	ws, _, _ := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	req := httptest.NewRequest(http.MethodPost, "/dynamic_close?wid=1&chunk-count=0&csum="+strings.Repeat("00", 32), nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing size, got %d", rr.Code)
	}
}

func TestHandler_HappyPath_Returns200(t *testing.T) {
	ws, wid, fi := makeState(t)
	var expectedCsum [32]byte
	fi.closeReturn = expectedCsum
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	csumHex := hex.EncodeToString(expectedCsum[:])
	// No chunks appended → size=0, chunk-count=0, offset=0.
	url := "/dynamic_close?wid=1&chunk-count=0&size=0&csum=" + csumHex
	_ = wid
	req := httptest.NewRequest(http.MethodPost, url, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestHandler_ChunkCountMismatch_Returns400(t *testing.T) {
	ws, wid, _ := makeState(t)
	var d [32]byte
	if err := ws.RegisterDynamicChunk(wid, d, 4096, false); err != nil {
		t.Fatal(err)
	}
	// Start offset 0; after append running offset becomes 4096.
	if err := ws.DynamicWriterAppendChunk(wid, 0, d); err != nil {
		t.Fatal(err)
	}
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	csumHex := strings.Repeat("00", 32)
	// Server has 1 chunk; client claims 0 → count mismatch.
	url := "/dynamic_close?wid=1&chunk-count=0&size=4096&csum=" + csumHex
	req := httptest.NewRequest(http.MethodPost, url, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for count mismatch, got %d", rr.Code)
	}
}

func TestHandler_CsumMismatch_Returns400(t *testing.T) {
	ws, _, fi := makeState(t)
	fi.closeReturn[0] = 0xAA
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	wrongCsum := strings.Repeat("00", 32)
	// size=0 matches Offset=0 (no chunks appended)
	url := "/dynamic_close?wid=1&chunk-count=0&size=0&csum=" + wrongCsum
	req := httptest.NewRequest(http.MethodPost, url, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for csum mismatch, got %d", rr.Code)
	}
}
