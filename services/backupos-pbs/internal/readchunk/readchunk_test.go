package readchunk

import (
	"bytes"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/rstate"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

var testBackupTime = time.Unix(1735000000, 0).UTC()

func makeSessionCtx(t *testing.T, datastoreRoot string) *streamctx.SessionContext {
	t.Helper()
	return &streamctx.SessionContext{
		SessionID:     "test-session",
		DatastoreID:   "ds-1",
		DatastoreRoot: datastoreRoot,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    testBackupTime,
		ReaderState:   rstate.New(),
	}
}

func withSession(h http.Handler, sc *streamctx.SessionContext) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
	})
}

// writeChunk creates the chunk file at <root>/.chunks/<first4>/<hex> with the given content.
func writeChunk(t *testing.T, root string, digest [32]byte, content []byte) {
	t.Helper()
	digestHex := hex.EncodeToString(digest[:])
	dir := filepath.Join(root, ".chunks", digestHex[:4])
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, digestHex), content, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	req, _ := http.NewRequest("POST", srv.URL+"/chunk?digest="+strings.Repeat("a", 64), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingDigest_Returns400(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/chunk")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_BadHex_Returns400(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	// 64 chars but not valid hex
	resp, err := http.Get(srv.URL + "/chunk?digest=" + strings.Repeat("z", 64))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_WrongDigestLength_Returns400(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	for _, length := range []int{63, 65} {
		resp, err := http.Get(srv.URL + "/chunk?digest=" + strings.Repeat("a", length))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for digest length %d, got %d", length, resp.StatusCode)
		}
	}
}

func TestHandler_DigestNotAllowed_Returns401(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	digestHex := strings.Repeat("ab", 32) // valid 64-char hex, not registered
	resp, err := http.Get(srv.URL + "/chunk?digest=" + digestHex)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "not allowed") {
		t.Errorf("expected 'not allowed' in body, got: %s", body)
	}
}

func TestHandler_AllowedDigest_StreamsBytes(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)

	var digest [32]byte
	digest[0] = 0xDE
	digest[1] = 0xAD
	want := []byte("chunk data blob bytes")
	writeChunk(t, tmp, digest, want)
	sc.ReaderState.RegisterChunk(digest)

	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	digestHex := hex.EncodeToString(digest[:])
	resp, err := http.Get(srv.URL + "/chunk?digest=" + digestHex)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("expected Content-Type application/octet-stream, got %q", ct)
	}
	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("body mismatch: got %q, want %q", got, want)
	}
}

func TestHandler_AllowedButMissingOnDisk_Returns404(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)

	var digest [32]byte
	digest[0] = 0xFF
	// Register but don't write the chunk file.
	sc.ReaderState.RegisterChunk(digest)

	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	digestHex := hex.EncodeToString(digest[:])
	resp, err := http.Get(srv.URL + "/chunk?digest=" + digestHex)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestHandler_NoStreamCtx_Returns500(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/chunk?digest=" + strings.Repeat("a", 64))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}
