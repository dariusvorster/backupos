package snapshotlocator

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
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

func makeSnapshotDir(t *testing.T, root, backupType, backupID string, ts int64) string {
	t.Helper()
	dir := filepath.Join(root, backupType, backupID, time.Unix(ts, 0).UTC().Format("2006-01-02T15:04:05Z"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestFromRequest_HappyPath(t *testing.T) {
	root := t.TempDir()
	makeSnapshotDir(t, root, "vm", "100", 1735000000)

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}

	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=1735000000", nil)

	res, status, err := FromRequest(r, "/files", lk)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != http.StatusOK {
		t.Errorf("expected 200, got %d", status)
	}
	if res.Datastore.Name != "default" {
		t.Errorf("wrong datastore: %s", res.Datastore.Name)
	}
	if res.BackupTime.Unix() != 1735000000 {
		t.Errorf("wrong backup time: %v", res.BackupTime)
	}
}

func TestFromRequest_MissingBackupType(t *testing.T) {
	root := t.TempDir()
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-id=100&backup-time=1735000000", nil)

	_, status, err := FromRequest(r, "/files", lk)
	if status != http.StatusBadRequest || err == nil {
		t.Errorf("expected 400, got %d: %v", status, err)
	}
}

func TestFromRequest_InvalidBackupTime(t *testing.T) {
	root := t.TempDir()
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=notanumber", nil)

	_, status, _ := FromRequest(r, "/files", lk)
	if status != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", status)
	}
}

func TestFromRequest_ZeroBackupTime(t *testing.T) {
	root := t.TempDir()
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=0", nil)

	_, status, _ := FromRequest(r, "/files", lk)
	if status != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", status)
	}
}

func TestFromRequest_DatastoreNotFound(t *testing.T) {
	lk := &stubLookup{stores: map[string]*datastore.Datastore{}}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/missing/files?backup-type=vm&backup-id=100&backup-time=1735000000", nil)

	_, status, _ := FromRequest(r, "/files", lk)
	if status != http.StatusNotFound {
		t.Errorf("expected 404, got %d", status)
	}
}

func TestFromRequest_SnapshotNotFound(t *testing.T) {
	root := t.TempDir() // no snapshot dir created
	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "1", Name: "default", Path: root},
	}}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/files?backup-type=vm&backup-id=100&backup-time=1735000000", nil)

	_, status, _ := FromRequest(r, "/files", lk)
	if status != http.StatusNotFound {
		t.Errorf("expected 404, got %d", status)
	}
}

func TestFromRequest_InvalidStoreInPath(t *testing.T) {
	lk := &stubLookup{stores: map[string]*datastore.Datastore{}}

	cases := []string{
		"/api2/json/admin/datastore/a/b/files",
		"/api2/json/admin/datastore/files",
	}
	for _, path := range cases {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		_, status, _ := FromRequest(r, "/files", lk)
		if status != http.StatusNotFound {
			t.Errorf("path %q: expected 404, got %d", path, status)
		}
	}
}
