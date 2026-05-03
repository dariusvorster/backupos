package previousarchive

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
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
	h := NewHandler()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodPost, "drive-0.img.fidx", &streamctx.SessionContext{}))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestPreviousArchive_NoStreamCtx_Returns500(t *testing.T) {
	h := NewHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/previous?archive-name=drive-0.img.fidx", nil)
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

func TestPreviousArchive_NoPreviousBackup_Returns404(t *testing.T) {
	h := NewHandler()
	sc := &streamctx.SessionContext{PreviousBackup: nil}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "drive-0.img.fidx", sc))
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestPreviousArchive_MissingArchiveName_Returns400(t *testing.T) {
	h := NewHandler()
	sc := &streamctx.SessionContext{PreviousBackup: &previous.Snapshot{}}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeRequest(http.MethodGet, "", sc))
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestPreviousArchive_InvalidArchiveName_Returns400(t *testing.T) {
	h := NewHandler()
	sc := &streamctx.SessionContext{PreviousBackup: &previous.Snapshot{}}
	w := httptest.NewRecorder()
	// URL encoding of "../evil.fidx" — use raw path injection
	r := httptest.NewRequest(http.MethodGet, "/previous?archive-name=..%2Fevil.fidx", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestPreviousArchive_ArchiveNotFound_Returns404(t *testing.T) {
	h := NewHandler()
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
	h := NewHandler()
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
