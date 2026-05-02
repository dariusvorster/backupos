package fixedindex

import (
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

func newTestSC(t *testing.T, root string) *streamctx.SessionContext {
	t.Helper()
	return &streamctx.SessionContext{
		SessionID:     "sess-test",
		DatastoreRoot: root,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0),
		WriterState:   wstate.New(),
	}
}

func TestFixedIndex_WrongMethod_Returns405(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/fixed_index?archive-name=drive-0.fidx&size=8388608")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_MissingStreamCtx_Returns500(t *testing.T) {
	srv := httptest.NewServer(NewHandler()) // no ctx injected
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?archive-name=drive-0.fidx&size=8388608", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_MissingArchiveName_Returns400(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?size=8388608", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_BadExtension_Returns400(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?archive-name=drive.blob&size=8388608", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for non-.fidx name, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_ReuseCsum_Returns400(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?archive-name=drive-0.fidx&size=8388608&reuse-csum=aabbcc", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for reuse-csum, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_MissingSize_Returns400(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?archive-name=drive-0.fidx", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing size, got %d", resp.StatusCode)
	}
}

func TestFixedIndex_HappyPath_ReturnsWid(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_index?archive-name=drive-0.fidx&size=8388608", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		Data int `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Data != 1 {
		t.Errorf("expected wid=1, got %d", body.Data)
	}
}

func TestFixedIndex_SecondCall_ReturnsWid2(t *testing.T) {
	sc := newTestSC(t, t.TempDir())
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	for i := 1; i <= 2; i++ {
		url := srv.URL + "/fixed_index?archive-name=drive-" + string(rune('0'+i-1)) + ".fidx&size=4194304"
		resp, _ := http.Post(url, "", nil)
		defer resp.Body.Close()
		var body struct{ Data int `json:"data"` }
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body.Data != i {
			t.Errorf("call %d: expected wid=%d, got %d", i, i, body.Data)
		}
	}
}
