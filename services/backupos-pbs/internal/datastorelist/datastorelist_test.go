package datastorelist

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func setupDB(t *testing.T, names ...string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL UNIQUE,
			path       TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	for i, name := range names {
		_, err = db.Exec(
			`INSERT INTO pbs_datastores (id, name, path, created_at) VALUES (?, ?, ?, ?)`,
			fmt.Sprintf("ds-%d", i), name, "/tmp/"+name, 0,
		)
		if err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func getJSON(t *testing.T, db *sql.DB, method string) (int, map[string]any) {
	t.Helper()
	h := NewHandler(db)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, "/api2/json/admin/datastore", nil)
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		return w.Code, nil
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v — body: %s", err, w.Body.String())
	}
	return w.Code, out
}

func TestDatastoreList_Empty(t *testing.T) {
	db := setupDB(t)
	code, body := getJSON(t, db, http.MethodGet)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	data, _ := body["data"].([]any)
	if len(data) != 0 {
		t.Errorf("expected empty data array, got %v", data)
	}
}

func TestDatastoreList_Single(t *testing.T) {
	db := setupDB(t, "default")
	code, body := getJSON(t, db, http.MethodGet)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	data, _ := body["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(data))
	}
	entry, _ := data[0].(map[string]any)
	if entry["store"] != "default" {
		t.Errorf("expected store=default, got %v", entry["store"])
	}
	if entry["comment"] != "" {
		t.Errorf("expected comment empty, got %v", entry["comment"])
	}
}

func TestDatastoreList_MultipleAlphabetical(t *testing.T) {
	// Insert in non-alphabetical order; expect sorted output.
	db := setupDB(t, "zebra", "alpha", "middle")
	code, body := getJSON(t, db, http.MethodGet)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	data, _ := body["data"].([]any)
	if len(data) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(data))
	}
	want := []string{"alpha", "middle", "zebra"}
	for i, w := range want {
		entry, _ := data[i].(map[string]any)
		if entry["store"] != w {
			t.Errorf("entry[%d]: expected %q, got %v", i, w, entry["store"])
		}
	}
}

func TestDatastoreList_WrongMethod(t *testing.T) {
	db := setupDB(t)
	h := NewHandler(db)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api2/json/admin/datastore", strings.NewReader(""))
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestDatastoreList_DBError(t *testing.T) {
	db := setupDB(t)
	// Close DB before the call to simulate a database error.
	_ = db.Close()

	h := NewHandler(db)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api2/json/admin/datastore", nil)
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}
