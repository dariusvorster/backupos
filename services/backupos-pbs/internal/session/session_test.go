package session

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_active_sessions (
			id            TEXT PRIMARY KEY,
			token_id      TEXT,
			datastore_id  TEXT,
			backup_type   TEXT NOT NULL,
			backup_id     TEXT NOT NULL,
			backup_time   INTEGER NOT NULL,
			started_at    INTEGER NOT NULL,
			state         TEXT NOT NULL,
			scratch_path  TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestBegin_InsertsRow(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, err := s.Begin(BeginParams{
		TokenID:     "tok-1",
		DatastoreID: "ds-1",
		BackupType:  "vm",
		BackupID:    "100",
		BackupTime:  time.Unix(1735000000, 0),
		Kind:        KindBackup,
	})
	if err != nil {
		t.Fatal(err)
	}
	if id == "" {
		t.Errorf("expected non-empty id, got empty")
	}

	var (
		gotState     string
		gotTokenID   sql.NullString
		gotBackupID  string
		gotBackupTm  int64
		gotStartedAt int64
	)
	err = db.QueryRow(`SELECT state, token_id, backup_id, backup_time, started_at FROM pbs_active_sessions WHERE id = ?`, id).
		Scan(&gotState, &gotTokenID, &gotBackupID, &gotBackupTm, &gotStartedAt)
	if err != nil {
		t.Fatal(err)
	}
	if gotState != "backup" {
		t.Errorf("state: got %q, want backup", gotState)
	}
	if !gotTokenID.Valid || gotTokenID.String != "tok-1" {
		t.Errorf("token_id: got %v", gotTokenID)
	}
	if gotBackupID != "100" {
		t.Errorf("backup_id: got %q", gotBackupID)
	}
	if gotBackupTm != 1735000000000 {
		t.Errorf("backup_time: got %d", gotBackupTm)
	}
	now := time.Now().UnixMilli()
	if gotStartedAt < now-5000 || gotStartedAt > now+5000 {
		t.Errorf("started_at: got %d, expected ~%d", gotStartedAt, now)
	}
}

func TestBegin_KindReader(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, err := s.Begin(BeginParams{
		TokenID:     "tok-1",
		DatastoreID: "ds-1",
		BackupType:  "vm",
		BackupID:    "100",
		BackupTime:  time.Unix(1735000000, 0),
		Kind:        KindReader,
	})
	if err != nil {
		t.Fatal(err)
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "reader" {
		t.Errorf("state: got %q, want reader", gotState)
	}
}

func TestFinalize_FromBackupToAborted(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	updated, err := s.Finalize(id)
	if err != nil {
		t.Fatal(err)
	}
	if !updated {
		t.Errorf("expected row updated, got false")
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "aborted" {
		t.Errorf("state: got %q, want aborted", gotState)
	}
}

func TestFinalize_AlreadyFinishedIsNoop(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	// Simulate M4c-go-finish having set state='finished'
	_, err := db.Exec(`UPDATE pbs_active_sessions SET state = 'finished' WHERE id = ?`, id)
	if err != nil {
		t.Fatal(err)
	}

	updated, err := s.Finalize(id)
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("expected no-op, but row was updated")
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "finished" {
		t.Errorf("state should remain finished, got %q", gotState)
	}
}

func TestFinalize_AlreadyAbortedIsNoop(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	if _, err := s.Finalize(id); err != nil {
		t.Fatal(err)
	}
	updated, err := s.Finalize(id)
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("second Finalize: expected no-op, but row was updated")
	}
}

func TestFinalize_NonexistentIDIsNoop(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	updated, err := s.Finalize("does-not-exist")
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("expected no-op for nonexistent ID")
	}
}

func TestFinish_FromBackupToFinished(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	updated, err := s.Finish(id)
	if err != nil {
		t.Fatal(err)
	}
	if !updated {
		t.Errorf("expected row updated, got false")
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "finished" {
		t.Errorf("state: got %q, want finished", gotState)
	}
}

func TestFinish_AlreadyFinishedIsNoop(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	if _, err := s.Finish(id); err != nil {
		t.Fatal(err)
	}
	updated, err := s.Finish(id)
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("second Finish: expected no-op, but row was updated")
	}
}

func TestFinish_AfterAbortedIsNoop(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	if _, err := s.Finalize(id); err != nil {
		t.Fatal(err)
	}
	updated, err := s.Finish(id)
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("Finish after Finalize: expected no-op, row was updated")
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "aborted" {
		t.Errorf("state should remain aborted, got %q", gotState)
	}
}

func TestOldestActiveStartedAt_NoSessions_ReturnsZero(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	got, err := s.OldestActiveStartedAt(context.Background())
	if err != nil {
		t.Fatalf("OldestActiveStartedAt: %v", err)
	}
	if !got.IsZero() {
		t.Errorf("expected zero time for empty table, got %v", got)
	}
}

func TestOldestActiveStartedAt_ReturnsOldestBackup(t *testing.T) {
	db := setupTestDB(t)
	db.SetMaxOpenConns(1)
	s := NewStore(db)

	// Insert two backup sessions with known started_at values.
	older := time.Now().Add(-2 * time.Hour).Truncate(time.Millisecond)
	newer := time.Now().Add(-1 * time.Hour).Truncate(time.Millisecond)

	_, err := db.Exec(`
		INSERT INTO pbs_active_sessions (id, token_id, datastore_id, backup_type, backup_id, backup_time, started_at, state)
		VALUES ('s1', '', '', 'vm', '100', 0, ?, 'backup')
	`, older.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
		INSERT INTO pbs_active_sessions (id, token_id, datastore_id, backup_type, backup_id, backup_time, started_at, state)
		VALUES ('s2', '', '', 'vm', '101', 0, ?, 'backup')
	`, newer.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.OldestActiveStartedAt(context.Background())
	if err != nil {
		t.Fatalf("OldestActiveStartedAt: %v", err)
	}
	if got.UnixMilli() != older.UnixMilli() {
		t.Errorf("got %v, want %v", got, older)
	}
}

func TestOldestActiveStartedAt_IgnoresNonBackupSessions(t *testing.T) {
	db := setupTestDB(t)
	db.SetMaxOpenConns(1)
	s := NewStore(db)

	// Reader and finished sessions should not count.
	for _, row := range []struct{ id, state string }{
		{"r1", "reader"},
		{"f1", "finished"},
		{"a1", "aborted"},
	} {
		_, err := db.Exec(`
			INSERT INTO pbs_active_sessions (id, token_id, datastore_id, backup_type, backup_id, backup_time, started_at, state)
			VALUES (?, '', '', 'vm', '100', 0, ?, ?)
		`, row.id, time.Now().Add(-time.Hour).UnixMilli(), row.state)
		if err != nil {
			t.Fatal(err)
		}
	}

	got, err := s.OldestActiveStartedAt(context.Background())
	if err != nil {
		t.Fatalf("OldestActiveStartedAt: %v", err)
	}
	if !got.IsZero() {
		t.Errorf("expected zero time (no backup sessions), got %v", got)
	}
}

// TestFinishThenFinalize_StaysFinished verifies the connection-close Finalize
// is a no-op when /finish already set state='finished'.
func TestFinishThenFinalize_StaysFinished(t *testing.T) {
	db := setupTestDB(t)
	s := NewStore(db)

	id, _ := s.Begin(BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: KindBackup,
	})

	if _, err := s.Finish(id); err != nil {
		t.Fatal(err)
	}
	updated, err := s.Finalize(id)
	if err != nil {
		t.Fatal(err)
	}
	if updated {
		t.Errorf("Finalize after Finish: expected no-op, row was updated")
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "finished" {
		t.Errorf("state should remain finished, got %q", gotState)
	}
}
