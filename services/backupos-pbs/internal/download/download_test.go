package download

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
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

func makeSnapDir(t *testing.T, root string) string {
	t.Helper()
	ts := testBackupTime.UTC().Format("2006-01-02T15:04:05Z")
	p := filepath.Join(root, "vm", "100", ts)
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func withSession(h http.Handler, sc *streamctx.SessionContext) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
	})
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	req, _ := http.NewRequest("POST", srv.URL+"/download?file-name=backup.blob", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingFileName_Returns400(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_InvalidFileName_Returns400(t *testing.T) {
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	cases := []string{"../escape", "with/slash", "with space", "has@symbol"}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			resp, err := http.Get(srv.URL + "/download?file-name=" + name)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected 400 for %q, got %d", name, resp.StatusCode)
			}
		})
	}
}

func TestHandler_PathEscape_Returns400(t *testing.T) {
	// Even if a name passes validFileName, the prefix check should catch escapes.
	// We test this by constructing a request manually with a raw query.
	tmp := t.TempDir()
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	// "..%2F..%2Fetc%2Fpasswd" URL-decodes to "../../etc/passwd"
	resp, err := http.Get(srv.URL + "/download?file-name=..%2F..%2Fetc%2Fpasswd")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for path-escape file-name, got %d", resp.StatusCode)
	}
}

func TestHandler_NonexistentFile_Returns404(t *testing.T) {
	tmp := t.TempDir()
	makeSnapDir(t, tmp)
	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=nosuchfile.blob")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestHandler_BlobFile_StreamsRawBytes(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)
	want := []byte("hello blob content")
	blobPath := filepath.Join(snapDir, "backup.blob")
	if err := os.WriteFile(blobPath, want, 0o644); err != nil {
		t.Fatal(err)
	}

	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=backup.blob")
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

func TestHandler_FidxFile_RegistersChunks_AndStreamsRawBytes(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)
	idxPath := filepath.Join(snapDir, "drive-0.img.fidx")
	const chunkSize = 4096

	digests := [][32]byte{
		{0: 0x11},
		{0: 0x22},
		{0: 0x33},
	}
	w, err := fidx.Create(idxPath, chunkSize*3, chunkSize)
	if err != nil {
		t.Fatal(err)
	}
	for i, d := range digests {
		offset := uint64((i + 1) * chunkSize)
		if err := w.AddChunk(offset, chunkSize, d); err != nil {
			t.Fatalf("AddChunk: %v", err)
		}
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}

	rawFile, err := os.ReadFile(idxPath)
	if err != nil {
		t.Fatal(err)
	}

	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=drive-0.img.fidx")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, rawFile) {
		t.Error("response body does not match raw .fidx file bytes")
	}

	// Verify all digests were registered in the session.
	for _, d := range digests {
		if !sc.ReaderState.CheckChunkAccess(d) {
			t.Errorf("digest %x not registered after /download", d)
		}
	}
}

func TestHandler_DidxFile_RegistersChunks_AndStreamsRawBytes(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)
	idxPath := filepath.Join(snapDir, "archive.pxar.didx")

	digests := [][32]byte{
		{0: 0xAA},
		{0: 0xBB},
	}
	dw, err := didx.Create(idxPath)
	if err != nil {
		t.Fatal(err)
	}
	offsets := []uint64{1024, 2048}
	for i, d := range digests {
		if err := dw.AddChunk(offsets[i], d); err != nil {
			t.Fatalf("AddChunk: %v", err)
		}
	}
	if _, err := dw.Close(); err != nil {
		t.Fatal(err)
	}

	rawFile, err := os.ReadFile(idxPath)
	if err != nil {
		t.Fatal(err)
	}

	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=archive.pxar.didx")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, rawFile) {
		t.Error("response body does not match raw .didx file bytes")
	}

	for _, d := range digests {
		if !sc.ReaderState.CheckChunkAccess(d) {
			t.Errorf("digest %x not registered after /download", d)
		}
	}
}

func TestHandler_NoStreamCtx_Returns500(t *testing.T) {
	// Handler called without session context injected.
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=backup.blob")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestHandler_NotARegularFile_Returns400(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)

	// Create a directory where a file is expected.
	dirPath := filepath.Join(snapDir, "notafile.blob")
	if err := os.Mkdir(dirPath, 0o755); err != nil {
		t.Fatal(err)
	}

	sc := makeSessionCtx(t, tmp)
	srv := httptest.NewServer(withSession(NewHandler(), sc))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/download?file-name=notafile.blob")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}
