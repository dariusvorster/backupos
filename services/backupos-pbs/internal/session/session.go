// Package session manages pbs_active_sessions row lifecycle.
//
// Sessions are created on upgrade-accepted and finalized when the connection
// closes. The state column transitions:
//
//	'backup' or 'reader'  (initial, set by Begin)
//	     ↓
//	'finished' (set by M4c-go-finish when client cleanly closes)
//	OR
//	'aborted' (set by Finalize when connection closes without finish)
//
// Finalize is idempotent: it only updates if state is still 'backup' or
// 'reader'. This means a session that's already 'finished' won't be
// downgraded to 'aborted' by the post-ServeConn cleanup path.
package session

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Kind identifies whether the session is for backup writes or reader reads.
// The initial state column value matches Kind (string-equal).
type Kind string

const (
	KindBackup Kind = "backup"
	KindReader Kind = "reader"
)

// BeginParams carries the data needed to insert a new session row.
//
// All foreign keys (TokenID, DatastoreID) must reference existing rows;
// the caller is expected to have already validated those.
type BeginParams struct {
	TokenID     string
	DatastoreID string
	BackupType  string // "vm" | "ct" | "host"
	BackupID    string
	BackupTime  time.Time
	Kind        Kind
}

// Store provides session lifecycle operations against pbs_active_sessions.
type Store struct {
	db *sql.DB
}

// NewStore constructs a session Store using the given DB connection.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Begin inserts a new session row with state=Kind. Returns the new session id.
func (s *Store) Begin(p BeginParams) (string, error) {
	id := uuid.NewString()
	now := time.Now().UnixMilli()

	const query = `
		INSERT INTO pbs_active_sessions (
			id, token_id, datastore_id, backup_type, backup_id, backup_time,
			started_at, state, scratch_path
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
	`
	_, err := s.db.Exec(query,
		id,
		p.TokenID,
		p.DatastoreID,
		p.BackupType,
		p.BackupID,
		p.BackupTime.UnixMilli(),
		now,
		string(p.Kind),
	)
	if err != nil {
		return "", fmt.Errorf("insert session: %w", err)
	}
	return id, nil
}

// Finalize updates the session's state to 'aborted' IF it's still in the
// initial 'backup' or 'reader' state. If state is already 'finished'
// (M4c-go-finish path) or already 'aborted', this is a no-op.
//
// Returns nil on success (including no-op). The boolean indicates whether
// the row was actually updated.
func (s *Store) Finalize(sessionID string) (bool, error) {
	const query = `
		UPDATE pbs_active_sessions
		SET state = 'aborted'
		WHERE id = ? AND state IN ('backup', 'reader')
	`
	res, err := s.db.Exec(query, sessionID)
	if err != nil {
		return false, fmt.Errorf("finalize session: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return rows > 0, nil
}

// ErrNotFound is returned when no session matches the id.
// Exposed for future M4c handlers that look up sessions by id during chunk uploads.
var ErrNotFound = errors.New("session not found")
