package dynamicappend

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// fakeDynIdx is a minimal DynamicIndexWriter stub.
type fakeDynIdx struct{ count uint64 }

func (f *fakeDynIdx) AddChunk(_ uint64, _ [32]byte) error { f.count++; return nil }
func (f *fakeDynIdx) IndexLength() uint64                 { return f.count }
func (f *fakeDynIdx) Close() ([32]byte, error)            { return [32]byte{}, nil }
func (f *fakeDynIdx) UUID() [16]byte                      { return [16]byte{} }
func (f *fakeDynIdx) Drop()                               {}

func makeState(t *testing.T) (*wstate.State, int) {
	t.Helper()
	ws := wstate.New()
	wid, err := ws.RegisterDynamicWriter("test.didx", &fakeDynIdx{})
	if err != nil {
		t.Fatalf("RegisterDynamicWriter: %v", err)
	}
	return ws, wid
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

func jsonBody(v any) *bytes.Reader {
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	ws, _ := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	req := httptest.NewRequest(http.MethodGet, "/dynamic_index", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_MismatchedLists_Returns400(t *testing.T) {
	ws, wid := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	body := appendRequest{
		Wid:        wid,
		DigestList: []string{"aa"},
		OffsetList: []uint64{},
	}
	req := httptest.NewRequest(http.MethodPut, "/dynamic_index", jsonBody(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_UnknownChunk_Returns400(t *testing.T) {
	ws, wid := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	body := appendRequest{
		Wid:        wid,
		DigestList: []string{"aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"},
		OffsetList: []uint64{65536},
	}
	req := httptest.NewRequest(http.MethodPut, "/dynamic_index", jsonBody(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for unknown chunk, got %d", rr.Code)
	}
}

func TestHandler_HappyPath_Returns200(t *testing.T) {
	ws, wid := makeState(t)

	// Register a chunk into knownChunks first.
	var digest [32]byte
	digest[0] = 0xDE
	digest[1] = 0xAD
	if err := ws.RegisterDynamicChunk(wid, digest, 4096, false); err != nil {
		t.Fatalf("RegisterDynamicChunk: %v", err)
	}

	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	digestHex := make([]byte, 32)
	digestHex[0] = 0xDE
	digestHex[1] = 0xAD
	var d [32]byte
	copy(d[:], digestHex)

	body := appendRequest{
		Wid:        wid,
		DigestList: []string{"dead" + "000000000000000000000000000000000000000000000000000000000000"},
		OffsetList: []uint64{65536},
	}
	// Fix digest hex to be exactly 64 chars matching the registered digest.
	hexStr := make([]byte, 64)
	for i := range hexStr {
		hexStr[i] = '0'
	}
	hexStr[0] = 'd'
	hexStr[1] = 'e'
	hexStr[2] = 'a'
	hexStr[3] = 'd'
	body.DigestList = []string{string(hexStr)}

	req := httptest.NewRequest(http.MethodPut, "/dynamic_index", jsonBody(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestHandler_InvalidWid_Returns400(t *testing.T) {
	ws, _ := makeState(t)
	h := injectCtx(makeSessionCtx(ws))(NewHandler())

	body := appendRequest{
		Wid:        0, // invalid
		DigestList: []string{},
		OffsetList: []uint64{},
	}
	req := httptest.NewRequest(http.MethodPut, "/dynamic_index", jsonBody(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}
