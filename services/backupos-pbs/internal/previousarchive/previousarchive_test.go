package previousarchive

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

func makeRequest(method, archiveName string, sc *streamctx.SessionContext) *http.Request {
	url := "/previous"
	if archiveName != "" {
		url += "?archive-name=" + archiveName
	}
	r := httptest.NewRequest(method, url, nil)
	if sc != nil {
		r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	}
	return r
}

func TestPreviousArchive_MethodNotAllowed(t *testing.T) {
	h := NewHandler(wstate.New())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodPost, "drive-0.img.fidx", &streamctx.SessionContext{}))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestPreviousArchive_NoStreamCtx_Returns500(t *testing.T) {
	h := NewHandler(wstate.New())
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/previous?archive-name=drive-0.img.fidx", nil)
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

func TestPreviousArchive_NoPreviousBackup_Returns404(t *testing.T) {
	h := NewHandler(wstate.New())
	sc := &streamctx.SessionContext{PreviousBackup: nil}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "drive-0.img.fidx", sc))
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestPreviousArchive_MissingArchiveName_Returns400(t *testing.T) {
	h := NewHandler(wstate.New())
	sc := &streamctx.SessionContext{PreviousBackup: &previous.Snapshot{}}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "", sc))
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestPreviousArchive_InvalidArchiveName_Returns400(t *testing.T) {
	h := NewHandler(wstate.New())
	sc := &streamctx.SessionContext{PreviousBackup: &previous.Snapshot{}}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/previous?archive-name=..%2Fevil.fidx", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestPreviousArchive_ArchiveNotFound_Returns404(t *testing.T) {
	h := NewHandler(wstate.New())
	sc := &streamctx.SessionContext{
		PreviousBackup: &previous.Snapshot{Path: t.TempDir(), Time: time.Now()},
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "drive-0.img.fidx", sc))
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestPreviousArchive_StreamsFile(t *testing.T) {
	dir := t.TempDir()
	content := []byte("fidx file data")
	if err := os.WriteFile(filepath.Join(dir, "drive-0.img.fidx"), content, 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHandler(wstate.New())
	sc := &streamctx.SessionContext{
		PreviousBackup: &previous.Snapshot{Path: dir, Time: time.Now()},
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "drive-0.img.fidx", sc))
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if w.Body.String() != string(content) {
		t.Errorf("body mismatch: got %q, want %q", w.Body.String(), string(content))
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("Content-Type: got %q, want application/octet-stream", ct)
	}
}

// buildTestDidx creates a .didx file in dir with the given (digest, size) pairs.
// end-offsets are cumulative sums of sizes (PBS convention).
func buildTestDidx(t *testing.T, dir, name string, chunks []struct {
	digest [32]byte
	size   uint64
}) string {
	t.Helper()
	finalPath := filepath.Join(dir, name)
	w, err := didx.Create(finalPath)
	if err != nil {
		t.Fatalf("didx.Create: %v", err)
	}
	var offset uint64
	for _, c := range chunks {
		offset += c.size
		if err := w.AddChunk(offset, c.digest); err != nil {
			w.Drop()
			t.Fatalf("AddChunk: %v", err)
		}
	}
	if _, err := w.Close(); err != nil {
		t.Fatalf("didx.Close: %v", err)
	}
	return finalPath
}

func TestServeHTTP_DidxRegistersChunks(t *testing.T) {
	dir := t.TempDir()

	var d1, d2 [32]byte
	d1[0] = 0x01
	d2[0] = 0x02

	buildTestDidx(t, dir, "root.pxar.didx", []struct {
		digest [32]byte
		size   uint64
	}{
		{d1, 1000},
		{d2, 2000},
	})

	ws := wstate.New()
	h := NewHandler(ws)
	sc := &streamctx.SessionContext{
		SessionID:      "test",
		PreviousBackup: &previous.Snapshot{Path: dir, Time: time.Now()},
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "root.pxar.didx", sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify body is the full file content.
	fileData, err := os.ReadFile(filepath.Join(dir, "root.pxar.didx"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(w.Body.Bytes(), fileData) {
		t.Errorf("body does not match file on disk (len got=%d want=%d)", w.Body.Len(), len(fileData))
	}

	// Verify chunks registered with correct sizes.
	size1, ok1 := ws.LookupChunk(d1)
	if !ok1 || size1 != 1000 {
		t.Errorf("d1: expected (1000, true), got (%d, %v)", size1, ok1)
	}
	size2, ok2 := ws.LookupChunk(d2)
	if !ok2 || size2 != 2000 {
		t.Errorf("d2: expected (2000, true), got (%d, %v)", size2, ok2)
	}
}

func TestServeHTTP_FidxDoesNotRegister(t *testing.T) {
	dir := t.TempDir()
	content := []byte("fidx body bytes — not parsed")
	if err := os.WriteFile(filepath.Join(dir, "drive-0.img.fidx"), content, 0o644); err != nil {
		t.Fatal(err)
	}

	ws := wstate.New()
	h := NewHandler(ws)
	sc := &streamctx.SessionContext{
		SessionID:      "test",
		PreviousBackup: &previous.Snapshot{Path: dir, Time: time.Now()},
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "drive-0.img.fidx", sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// Body streamed unchanged.
	if !bytes.Equal(w.Body.Bytes(), content) {
		t.Errorf("body mismatch")
	}

	// No chunks should have been registered.
	var anyDigest [32]byte
	_, ok := ws.LookupChunk(anyDigest)
	if ok {
		t.Errorf("expected no chunks registered for .fidx, but found one")
	}
}

func TestServeHTTP_DidxParseError(t *testing.T) {
	dir := t.TempDir()
	// Write a corrupt .didx: 100 bytes of garbage (less than the 4096-byte header).
	garbage := make([]byte, 100)
	for i := range garbage {
		garbage[i] = 0xFF
	}
	if err := os.WriteFile(filepath.Join(dir, "corrupt.didx"), garbage, 0o644); err != nil {
		t.Fatal(err)
	}

	ws := wstate.New()
	h := NewHandler(ws)
	sc := &streamctx.SessionContext{
		SessionID:      "test",
		PreviousBackup: &previous.Snapshot{Path: dir, Time: time.Now()},
	}
	w := httptest.NewRecorder()

	r := httptest.NewRequest(http.MethodGet, "/previous?archive-name=corrupt.didx", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	h.ServeHTTP(w, r)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}

	// No chunks should have been registered.
	var anyDigest [32]byte
	_, ok := ws.LookupChunk(anyDigest)
	if ok {
		t.Errorf("expected no chunks registered on parse error, but found one")
	}

	// Verify body is not the file content (it's the JSON error).
	if bytes.Contains(w.Body.Bytes(), garbage) {
		t.Errorf("corrupt file content leaked into error response")
	}
}
