package snapshotnotes

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"

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

// stubHandler mirrors the real Handler but uses the interface for testability.
type stubHandler struct {
	datastores snapshotlocator.DatastoreLookup
	db         *sql.DB
}

func (h *stubHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		res, status, err := snapshotlocator.FromRequest(r, "/notes", h.datastores)
		if err != nil {
			http.Error(w, err.Error(), status)
			return
		}
		handler := &Handler{db: h.db}
		notes, err := handler.queryNotes(res.Datastore.ID,
			r.URL.Query().Get("backup-type"),
			r.URL.Query().Get("backup-id"),
			res.BackupTime.UnixMilli())
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": notes})
	case http.MethodPut:
		res, status, err := snapshotlocator.FromRequest(r, "/notes", h.datastores)
		if err != nil {
			http.Error(w, err.Error(), status)
			return
		}
		handler := &Handler{db: h.db}
		updated, err := handler.updateNotes(res.Datastore.ID,
			r.URL.Query().Get("backup-type"),
			r.URL.Query().Get("backup-id"),
			res.BackupTime.UnixMilli(),
			r.URL.Query().Get("notes"))
		if err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		if !updated {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":null}`))
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func makeSnapDir(t *testing.T, root string, ts int64) {
	t.Helper()
	dir := filepath.Join(root, "vm", "100", time.Unix(ts, 0).UTC().Format("2006-01-02T15:04:05Z"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		CREATE TABLE pbs_snapshots (
			id TEXT PRIMARY KEY,
			datastore_id TEXT,
			backup_type TEXT,
			backup_id TEXT,
			backup_time INTEGER,
			notes TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func insertSnapshot(t *testing.T, db *sql.DB, datastoreID, backupType, backupID string, backupTimeMs int64, notes *string) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO pbs_snapshots (id, datastore_id, backup_type, backup_id, backup_time, notes) VALUES (?, ?, ?, ?, ?, ?)`,
		"snap-1", datastoreID, backupType, backupID, backupTimeMs, notes,
	)
	if err != nil {
		t.Fatal(err)
	}
}

func TestHandler_WrongMethod(t *testing.T) {
	h := &stubHandler{datastores: &stubLookup{}, db: openTestDB(t)}
	r := httptest.NewRequest(http.MethodPost, "/api2/json/admin/datastore/default/notes", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_GET_NullNotes(t *testing.T) {
	root := t.TempDir()
	makeSnapDir(t, root, 1735000000)
	db := openTestDB(t)
	insertSnapshot(t, db, "ds-1", "vm", "100", time.Unix(1735000000, 0).UnixMilli(), nil)

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "ds-1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk, db: db}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/notes?backup-type=vm&backup-id=100&backup-time=1735000000", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp["data"] != "" {
		t.Errorf("expected empty notes, got %v", resp["data"])
	}
}

func TestHandler_GET_NotFound(t *testing.T) {
	root := t.TempDir()
	makeSnapDir(t, root, 1735000000)
	db := openTestDB(t)
	// No row inserted.

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "ds-1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk, db: db}
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/datastore/default/notes?backup-type=vm&backup-id=100&backup-time=1735000000", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestHandler_PUT_UpdatesNotes(t *testing.T) {
	root := t.TempDir()
	makeSnapDir(t, root, 1735000000)
	db := openTestDB(t)
	insertSnapshot(t, db, "ds-1", "vm", "100", time.Unix(1735000000, 0).UnixMilli(), nil)

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "ds-1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk, db: db}
	r := httptest.NewRequest(http.MethodPut,
		"/api2/json/admin/datastore/default/notes?backup-type=vm&backup-id=100&backup-time=1735000000&notes=hello", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	// Verify the DB was actually updated.
	var notes string
	if err := db.QueryRow(`SELECT COALESCE(notes,'') FROM pbs_snapshots WHERE id='snap-1'`).Scan(&notes); err != nil {
		t.Fatal(err)
	}
	if notes != "hello" {
		t.Errorf("expected notes='hello', got %q", notes)
	}
}

func TestHandler_PUT_NotFound(t *testing.T) {
	root := t.TempDir()
	makeSnapDir(t, root, 1735000000)
	db := openTestDB(t)
	// No row inserted.

	lk := &stubLookup{stores: map[string]*datastore.Datastore{
		"default": {ID: "ds-1", Name: "default", Path: root},
	}}
	h := &stubHandler{datastores: lk, db: db}
	r := httptest.NewRequest(http.MethodPut,
		"/api2/json/admin/datastore/default/notes?backup-type=vm&backup-id=100&backup-time=1735000000&notes=x", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}
