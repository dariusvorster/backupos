package files

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshotlocator"
)

// stubLookup satisfies snapshotlocator.DatastoreLookup.
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

// stubHandler wraps the files logic but accepts DatastoreLookup interface
// so tests can inject a stub without a real DB.
type stubHandler struct {
	datastores snapshotlocator.DatastoreLookup
}

func (h *stubHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	res, status, err := snapshotlocator.FromRequest(r, "/files", h.datastores)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}
	entries, err := listArchives(res.SnapDir)
	if err != nil {
		http.Error(w, "readdir failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": entries})
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
	r := httptest.NewRequest(http.MethodPost, "/api2/json/admin/datastore/default/files", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_MissingParams(t *testing.T) {
	root := t.TempDir()
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_EmptySnapshot(t *testing.T) {
	root := t.TempDir()
	makeSnapDir(t, root, 1735000000)
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=1735000000", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	data, _ := resp["data"].([]any)
	if len(data) != 0 {
		t.Errorf("expected empty list, got %v", data)
	}
}

func TestHandler_ListsArchivesOnly(t *testing.T) {
	root := t.TempDir()
	snapDir := makeSnapDir(t, root, 1735000000)

	// Create archive files and a non-archive file.
	for _, name := range []string{"drive-0.qcow2.didx", "drive-1.raw.fidx", "qemu.conf.blob", "client.log.blob", "manifest.json"} {
		if err := os.WriteFile(filepath.Join(snapDir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=1735000000", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		Data []fileEntry `json:"data"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}

	// manifest.json must be excluded.
	for _, e := range resp.Data {
		if e.Filename == "manifest.json" {
			t.Error("manifest.json should not appear in file listing")
		}
		if e.CryptMode != "none" {
			t.Errorf("crypt-mode should be none, got %q", e.CryptMode)
		}
	}

	if len(resp.Data) != 4 {
		t.Errorf("expected 4 archive entries, got %d", len(resp.Data))
	}

	// Verify sorted order.
	for i := 1; i < len(resp.Data); i++ {
		if resp.Data[i].Filename < resp.Data[i-1].Filename {
			t.Errorf("entries not sorted: %s < %s", resp.Data[i].Filename, resp.Data[i-1].Filename)
		}
	}
}
