package dynamicchunk

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

func makeSessionCtx(datastoreRoot string) *streamctx.SessionContext {
	return &streamctx.SessionContext{
		SessionID:     "test-session",
		DatastoreID:   "ds-1",
		DatastoreRoot: datastoreRoot,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0).UTC(),
		WriterState:   wstate.New(),
	}
}

func injectCtx(sc *streamctx.SessionContext) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
		})
	}
}

// makeUncompressedBlob builds a minimal valid DataBlob (uncompressed magic).
func makeUncompressedBlob(payload []byte) []byte {
	magic := [8]byte{66, 171, 56, 7, 190, 131, 112, 161}
	var buf bytes.Buffer
	buf.Write(magic[:])
	var crc [4]byte
	binary.LittleEndian.PutUint32(crc[:], 0)
	buf.Write(crc[:])
	buf.Write(payload)
	return buf.Bytes()
}

// fakeDynIdx is a minimal DynamicIndexWriter stub.
type fakeDynIdx struct{ count uint64 }

func (f *fakeDynIdx) AddChunk(_ uint64, _ [32]byte) error { f.count++; return nil }
func (f *fakeDynIdx) IndexLength() uint64                 { return f.count }
func (f *fakeDynIdx) Close() ([32]byte, error)            { return [32]byte{}, nil }
func (f *fakeDynIdx) UUID() [16]byte                      { return [16]byte{} }
func (f *fakeDynIdx) Drop()                               {}

func registerDynamicWriter(t *testing.T, ws *wstate.State) int {
	t.Helper()
	wid, err := ws.RegisterDynamicWriter("test.didx", &fakeDynIdx{})
	if err != nil {
		t.Fatalf("RegisterDynamicWriter: %v", err)
	}
	return wid
}

func TestHandler_MissingWid_Returns400(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_chunk?digest="+hex.EncodeToString(make([]byte, 32))+"&size=1&encoded-size=13",
		bytes.NewReader(makeUncompressedBlob([]byte{0})))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodGet, "/dynamic_chunk", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_InvalidWid_Returns400(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_chunk?wid=0&digest="+hex.EncodeToString(make([]byte, 32))+"&size=1&encoded-size=13",
		nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_BodySizeMismatch_Returns400(t *testing.T) {
	dir := t.TempDir()
	ws := wstate.New()
	wid := registerDynamicWriter(t, ws)
	sc := &streamctx.SessionContext{
		SessionID:     "s",
		DatastoreRoot: dir,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0).UTC(),
		WriterState:   ws,
	}
	h := injectCtx(sc)(NewHandler())

	body := makeUncompressedBlob([]byte{0xAB})
	url := "/dynamic_chunk?wid=" + strconv.Itoa(wid) +
		"&digest=" + hex.EncodeToString(make([]byte, 32)) +
		"&size=1&encoded-size=99" // 99 != len(body)
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}
