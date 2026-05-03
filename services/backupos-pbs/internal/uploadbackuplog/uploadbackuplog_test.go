package uploadbackuplog

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshotlocator"
)

type stubLookup struct {
	stores map[string]*datastore.Datastore
}

func (s *stubLookup) ByName(name string) (*datastore.Datastore, error) {
	ds, ok := s.stores[name]
	if !ok {
		return nil, datastore.ErrNotFound
	}
	return ds, nil
}

type stubHandler struct {
	datastores snapshotlocator.DatastoreLookup
}

func (h *stubHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	res, status, err := snapshotlocator.FromRequest(r, "/upload-backup-log", h.datastores)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	finalPath := filepath.Join(res.SnapDir, logFileName)
	if _, statErr := os.Stat(finalPath); statErr == nil {
		http.Error(w, "client.log.blob already exists", http.StatusConflict)
		return
	}

	body := r.Body
	tmpPath, written, err := writeTempFile(res.SnapDir, body)
	if err != nil {
		if tmpPath != "" {
			_ = os.Remove(tmpPath)
		}
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	if written > maxLogSize {
		_ = os.Remove(tmpPath)
		http.Error(w, "too large", http.StatusBadRequest)
		return
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		http.Error(w, "rename failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

func makeSnapDir(t *testing.T, root string, ts int64) string {
	t.Helper()
	dir := filepath.Join(root, "vm", "100", time.Unix(ts, 0).UTC().Format("2006-01-02T15:04:05Z"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestHandler_WrongMethod(t *testing.T) {
	h := &stubHandler{datastores: &stubLookup{}}
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore/default/upload-backup-log", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_HappyPath(t *testing.T) {
	root := t.TempDir()
	snapDir := makeSnapDir(t, root, 1735000000)
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}

	body := strings.NewReader("log content")
	r := httptest.NewRequest(http.MethodPost,
		"/api2/json/admin/datastore/default/upload-backup-log?backup-type=vm&backup-id=100&backup-time=1735000000",
		body)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	logPath := filepath.Join(snapDir, logFileName)
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("log file not created: %v", err)
	}
	if string(data) != "log content" {
		t.Errorf("unexpected file content: %q", data)
	}
}

func TestHandler_Conflict(t *testing.T) {
	root := t.TempDir()
	snapDir := makeSnapDir(t, root, 1735000000)
	// Pre-create the log file.
	if err := os.WriteFile(filepath.Join(snapDir, logFileName), []byte("existing"), 0o644); err != nil {
		t.Fatal(err)
	}

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}
	r := httptest.NewRequest(http.MethodPost,
		"/api2/json/admin/datastore/default/upload-backup-log?backup-type=vm&backup-id=100&backup-time=1735000000",
		strings.NewReader("new log"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", rr.Code)
	}
}

func TestHandler_MissingParams(t *testing.T) {
	root := t.TempDir()
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}
	r := httptest.NewRequest(http.MethodPost,
		"/api2/json/admin/datastore/default/upload-backup-log?backup-type=vm",
		bytes.NewReader(nil))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}
