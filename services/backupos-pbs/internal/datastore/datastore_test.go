package datastore

import (
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"
)

// setupTestDB creates an in-memory SQLite DB with the pbs_datastores schema
// and a seeded row for testing.
//
// We minimize the schema to only the columns Lookup reads. The full
// Drizzle-generated schema is not needed for an isolated lookup test.
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id                  TEXT PRIMARY KEY,
			name                TEXT NOT NULL UNIQUE,
			path                TEXT NOT NULL,
			created_at          INTEGER NOT NULL,
			prune_schedule      TEXT,
			gc_schedule         TEXT,
			last_gc_at          INTEGER,
			total_size_bytes    INTEGER,
			unique_size_bytes   INTEGER,
			chunk_count         INTEGER
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.Exec(`
		INSERT INTO pbs_datastores (id, name, path, created_at)
		VALUES ('test-id-1', 'default', '/var/lib/backupos/pbs/default', 1735000000000)
	`)
	if err != nil {
		t.Fatal(err)
	}

	return db
}

func TestValidateName_Valid(t *testing.T) {
	cases := []string{
		"default",
		"a",
		"a-b_c",
		"123",
		"DataStore_v2",
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_", // 64 chars
	}
	for _, c := range cases {
		t.Run(c, func(t *testing.T) {
			if err := ValidateName(c); err != nil {
				t.Errorf("expected valid, got %v", err)
			}
		})
	}
}

func TestValidateName_Invalid(t *testing.T) {
	cases := []string{
		"",
		"with spaces",
		"with/slash",
		"with.dot",
		"with:colon",
		"../etc/passwd",
		"../../escape",
		"a" + string(make([]byte, 64)), // > 64 chars
	}
	for _, c := range cases {
		t.Run(c, func(t *testing.T) {
			if err := ValidateName(c); !errors.Is(err, ErrInvalidName) {
				t.Errorf("expected ErrInvalidName, got %v", err)
			}
		})
	}
}

func TestLookup_Success(t *testing.T) {
	db := setupTestDB(t)
	l := NewLookup(db)

	ds, err := l.ByName("default")
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if ds.ID != "test-id-1" {
		t.Errorf("ID: got %q", ds.ID)
	}
	if ds.Name != "default" {
		t.Errorf("Name: got %q", ds.Name)
	}
	if ds.Path != "/var/lib/backupos/pbs/default" {
		t.Errorf("Path: got %q", ds.Path)
	}
	if ds.CreatedAt.UnixMilli() != 1735000000000 {
		t.Errorf("CreatedAt: got %v", ds.CreatedAt)
	}
}

func TestLookup_NotFound(t *testing.T) {
	db := setupTestDB(t)
	l := NewLookup(db)

	_, err := l.ByName("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestLookup_InvalidNameRejectedWithoutDBQuery(t *testing.T) {
	db := setupTestDB(t)
	l := NewLookup(db)

	_, err := l.ByName("../escape")
	if !errors.Is(err, ErrInvalidName) {
		t.Errorf("expected ErrInvalidName, got %v", err)
	}
}
