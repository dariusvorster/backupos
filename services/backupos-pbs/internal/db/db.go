// Package db provides a shared SQLite connection for the backupos-pbs service.
//
// The DB schema is owned by the Node side (Drizzle migrations); the Go
// service reads tables it needs (pbs_tokens, pbs_datastores) and will
// write a small, well-defined set of tables in subsequent PRs
// (pbs_active_sessions, pbs_chunks, etc).
//
// Connection is opened once at startup, shared across handlers. SQLite's
// WAL mode handles concurrent multi-process access — the Node service
// also has the DB open via better-sqlite3 with WAL.
package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "modernc.org/sqlite"
)

// Open opens the SQLite database for read+write access.
//
// In M4b-go-auth this PR uses only reads, but we open r/w because
// subsequent PRs will write pbs_active_sessions etc. WAL mode is
// already enabled by the Node side; we don't set journal_mode here.
//
// The connection enforces busy-timeout=5000ms so we don't immediately
// fail on transient lock contention with the Node service.
func Open(path string) (*sql.DB, error) {
	// modernc.org/sqlite uses URL-style DSN with query params for pragmas.
	// We URL-escape the path because filesystem paths can technically
	// contain characters that are invalid in URL paths.
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", url.PathEscape(path))

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// Verify the connection works and the DB is reachable.
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	// Single connection is sufficient for our auth-path workload.
	// Multiple connections to the same SQLite file work but mostly
	// don't help with WAL writes (which serialize anyway).
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)

	return db, nil
}
