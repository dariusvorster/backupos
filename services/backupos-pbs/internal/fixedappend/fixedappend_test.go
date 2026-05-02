package fixedappend

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
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

type testFidx struct{ chunks int }

func (f *testFidx) AddChunk(_ uint64, _ uint32, _ [32]byte) error {
	f.chunks++
	return nil
}
func (f *testFidx) IndexLength() uint64       { return uint64(f.chunks) }
func (f *testFidx) Close() ([32]byte, error)  { return [32]byte{}, nil }
func (f *testFidx) UUID() [16]byte            { return [16]byte{} }
func (f *testFidx) Drop()                     {}

func setupSC(t *testing.T) (*streamctx.SessionContext, int, [32]byte) {
	t.Helper()
	ws := wstate.New()
	fi := &testFidx{}
	size := uint64(4 * 1024 * 1024)
	wid, _ := ws.RegisterFixedWriter("drive-0.fidx", fi, &size, 4*1024*1024, false)

	// Register a known chunk in the session.
	var digest [32]byte
	for i := range digest {
		digest[i] = byte(i)
	}
	_ = ws.RegisterFixedChunk(wid, digest, 4*1024*1024, false)

	sc := &streamctx.SessionContext{
		SessionID:   "sess-test",
		WriterState: ws,
		BackupType:  "vm",
		BackupID:    "100",
		BackupTime:  time.Unix(1735000000, 0),
	}
	return sc, wid, digest
}

func bodyJSON(v interface{}) *bytes.Buffer {
	b, _ := json.Marshal(v)
	return bytes.NewBuffer(b)
}

func TestFixedAppend_WrongMethod_Returns405(t *testing.T) {
	sc, _, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index", "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestFixedAppend_MissingStreamCtx_Returns500(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/fixed_index",
		bodyJSON(map[string]interface{}{"wid": 1, "digest-list": []string{}, "offset-list": []int{}}))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestFixedAppend_MismatchedLists_Returns400(t *testing.T) {
	sc, wid, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	body := map[string]interface{}{
		"wid":         wid,
		"digest-list": []string{"aa"},
		"offset-list": []int{},
	}
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/fixed_index", bodyJSON(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for mismatched lists, got %d", resp.StatusCode)
	}
}

func TestFixedAppend_DigestNotInKnownChunks_Returns400(t *testing.T) {
	sc, wid, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	var unknownDigest [32]byte
	unknownDigest[0] = 0xFF
	body := map[string]interface{}{
		"wid":         wid,
		"digest-list": []string{hex.EncodeToString(unknownDigest[:])},
		"offset-list": []uint64{4194304},
	}
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/fixed_index", bodyJSON(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for unknown digest, got %d", resp.StatusCode)
	}
}

func TestFixedAppend_HappyPath_Returns200(t *testing.T) {
	sc, wid, digest := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	body := map[string]interface{}{
		"wid":         wid,
		"digest-list": []string{hex.EncodeToString(digest[:])},
		"offset-list": []uint64{4194304},
	}
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/fixed_index", bodyJSON(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}
