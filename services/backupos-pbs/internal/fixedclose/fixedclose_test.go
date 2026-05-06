package fixedclose

import (
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

func injectCtx(sc *streamctx.SessionContext, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
	})
}

type testFidx struct {
	chunks      int
	closeReturn [32]byte
}

func (f *testFidx) AddChunk(_ uint64, _ uint32, _ [32]byte) error {
	f.chunks++
	return nil
}
func (f *testFidx) IndexLength() uint64      { return uint64(f.chunks) }
func (f *testFidx) Close() ([32]byte, error) { return f.closeReturn, nil }
func (f *testFidx) UUID() [16]byte           { return [16]byte{} }
func (f *testFidx) Drop()                    {}

func setupSC(t *testing.T, serverCsum [32]byte) (*streamctx.SessionContext, int) {
	t.Helper()
	ws := wstate.New()
	fi := &testFidx{closeReturn: serverCsum}
	size := uint64(4 * 1024 * 1024)
	wid, _ := ws.RegisterFixedWriter("drive-0.fidx", fi, &size, 4*1024*1024, false)

	// Append one chunk so server chunk count = 1.
	var digest [32]byte
	_ = ws.FixedWriterAppendChunk(wid, 4194304, 4194304, digest)

	sc := &streamctx.SessionContext{
		SessionID:   "sess-test",
		WriterState: ws,
		BackupType:  "vm",
		BackupID:    "100",
		BackupTime:  time.Unix(1735000000, 0),
	}
	return sc, wid
}

func closeURL(base string, wid int, chunkCount uint64, size uint64, csum [32]byte) string {
	return fmt.Sprintf("%s/fixed_close?wid=%d&chunk-count=%d&size=%d&csum=%s",
		base, wid, chunkCount, size, hex.EncodeToString(csum[:]))
}

func TestFixedClose_WrongMethod_Returns405(t *testing.T) {
	var csum [32]byte
	sc, wid := setupSC(t, csum)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, closeURL(srv.URL, wid, 1, 4194304, csum), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestFixedClose_MissingStreamCtx_Returns500(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	var csum [32]byte
	resp, err := http.Post(closeURL(srv.URL, 1, 0, 0, csum), "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestFixedClose_WrongChunkCount_Returns400(t *testing.T) {
	var serverCsum [32]byte
	sc, wid := setupSC(t, serverCsum)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	// Server appended 1 chunk; client claims 2.
	resp, err := http.Post(closeURL(srv.URL, wid, 2, 4194304, serverCsum), "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for chunk count mismatch, got %d", resp.StatusCode)
	}
}

func TestFixedClose_CsumMismatch_Returns400(t *testing.T) {
	var serverCsum [32]byte
	serverCsum[0] = 0xAA
	sc, wid := setupSC(t, serverCsum)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	var wrongCsum [32]byte
	wrongCsum[0] = 0xBB
	resp, err := http.Post(closeURL(srv.URL, wid, 1, 4194304, wrongCsum), "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for csum mismatch, got %d", resp.StatusCode)
	}
}

func TestFixedClose_HappyPath_Returns200(t *testing.T) {
	var serverCsum [32]byte
	for i := range serverCsum {
		serverCsum[i] = byte(i)
	}
	sc, wid := setupSC(t, serverCsum)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(closeURL(srv.URL, wid, 1, 4194304, serverCsum), "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestFixedClose_MissingParams_Returns400(t *testing.T) {
	var csum [32]byte
	sc, _ := setupSC(t, csum)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_close", "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing params, got %d", resp.StatusCode)
	}
}
