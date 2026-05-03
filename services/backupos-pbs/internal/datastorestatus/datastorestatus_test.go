package datastorestatus

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

func setupDB(t *testing.T, name, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id                   TEXT PRIMARY KEY,
			name                 TEXT NOT NULL UNIQUE,
			path                 TEXT NOT NULL,
			created_at           INTEGER NOT NULL,
			gc_schedule_interval TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	if name != "" {
		_, err = db.Exec(
			`INSERT INTO pbs_datastores (id, name, path, created_at) VALUES (?, ?, ?, ?)`,
			"ds-1", name, path, 0,
		)
		if err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestDatastoreStatus_Success(t *testing.T) {
	dir := t.TempDir()
	db := setupDB(t, "default", dir)
	h := NewHandler(datastore.NewLookup(db))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore/default/status", nil)
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	data, ok := out["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %T", out["data"])
	}
	total, _ := data["total"].(float64)
	if total <= 0 {
		t.Errorf("expected total > 0, got %v", total)
	}
	used, _ := data["used"].(float64)
	if used < 0 {
		t.Errorf("expected used >= 0, got %v", used)
	}
	avail, _ := data["avail"].(float64)
	if avail < 0 {
		t.Errorf("expected avail >= 0, got %v", avail)
	}
}

func TestDatastoreStatus_WrongMethod(t *testing.T) {
	dir := t.TempDir()
	db := setupDB(t, "default", dir)
	h := NewHandler(datastore.NewLookup(db))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api2/json/admin/datastore/default/status", nil)
	h.ServeHTTP(w, r)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestDatastoreStatus_UnknownStore(t *testing.T) {
	db := setupDB(t, "", "")
	h := NewHandler(datastore.NewLookup(db))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore/nonexistent/status", nil)
	h.ServeHTTP(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestDatastoreStatus_MalformedPath(t *testing.T) {
	dir := t.TempDir()
	db := setupDB(t, "foo", dir)
	h := NewHandler(datastore.NewLookup(db))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore/foo/something", nil)
	h.ServeHTTP(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestDatastoreStatus_SlashInStoreName(t *testing.T) {
	dir := t.TempDir()
	db := setupDB(t, "foo", dir)
	h := NewHandler(datastore.NewLookup(db))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore/foo/bar/status", nil)
	h.ServeHTTP(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
