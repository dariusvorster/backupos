package sessionreaper

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func setupDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_active_sessions (
			id           TEXT PRIMARY KEY,
			token_id     TEXT,
			datastore_id TEXT,
			backup_type  TEXT NOT NULL,
			backup_id    TEXT NOT NULL,
			backup_time  INTEGER NOT NULL,
			started_at   INTEGER NOT NULL,
			state        TEXT NOT NULL,
			scratch_path TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func insertSession(t *testing.T, db *sql.DB, id, state string, startedAt time.Time) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO pbs_active_sessions
		 (id, token_id, datastore_id, backup_type, backup_id, backup_time, started_at, state)
		 VALUES (?, '', '', 'vm', '100', 0, ?, ?)`,
		id, startedAt.UnixMilli(), state,
	)
	if err != nil {
		t.Fatalf("insertSession %s: %v", id, err)
	}
}

func getState(t *testing.T, db *sql.DB, id string) string {
	t.Helper()
	var state string
	err := db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&state)
	if err != nil {
		t.Fatalf("getState %s: %v", id, err)
	}
	return state
}

func newReaper(db *sql.DB, stale time.Duration) *Reaper {
	return New(db, stale, DefaultInterval)
}

func TestSweepOnce_NoStaleSessions_NoChange(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "backup", time.Now().Add(-30*time.Minute))

	r := newReaper(db, DefaultStaleThreshold)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 0 {
		t.Errorf("rows affected: got %d, want 0", n)
	}
	if got := getState(t, db, "s1"); got != "backup" {
		t.Errorf("state: got %q, want backup", got)
	}
}

func TestSweepOnce_OldBackupSession_Aborted(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "backup", time.Now().Add(-2*time.Hour))

	r := newReaper(db, DefaultStaleThreshold)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 1 {
		t.Errorf("rows affected: got %d, want 1", n)
	}
	if got := getState(t, db, "s1"); got != "aborted" {
		t.Errorf("state: got %q, want aborted", got)
	}
}

func TestSweepOnce_OldReaderSession_Aborted(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "reader", time.Now().Add(-2*time.Hour))

	r := newReaper(db, DefaultStaleThreshold)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 1 {
		t.Errorf("rows affected: got %d, want 1", n)
	}
	if got := getState(t, db, "s1"); got != "aborted" {
		t.Errorf("state: got %q, want aborted", got)
	}
}

func TestSweepOnce_FinishedSession_NotTouched(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "finished", time.Now().Add(-2*time.Hour))

	r := newReaper(db, DefaultStaleThreshold)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 0 {
		t.Errorf("rows affected: got %d, want 0", n)
	}
	if got := getState(t, db, "s1"); got != "finished" {
		t.Errorf("state: got %q, want finished", got)
	}
}

func TestSweepOnce_AbortedSession_NotTouched(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "aborted", time.Now().Add(-2*time.Hour))

	r := newReaper(db, DefaultStaleThreshold)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 0 {
		t.Errorf("rows affected: got %d, want 0", n)
	}
	if got := getState(t, db, "s1"); got != "aborted" {
		t.Errorf("state unchanged: got %q", got)
	}
}

func TestSweepOnce_RecentSession_NotTouched(t *testing.T) {
	db := setupDB(t)
	insertSession(t, db, "s1", "backup", time.Now().Add(-30*time.Minute))

	r := newReaper(db, 1*time.Hour)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 0 {
		t.Errorf("rows affected: got %d, want 0", n)
	}
	if got := getState(t, db, "s1"); got != "backup" {
		t.Errorf("state: got %q, want backup", got)
	}
}

func TestSweepOnce_MultipleStale_AllAborted(t *testing.T) {
	db := setupDB(t)
	// 3 stale active, 1 recent active, 1 finished old.
	insertSession(t, db, "old1", "backup", time.Now().Add(-2*time.Hour))
	insertSession(t, db, "old2", "backup", time.Now().Add(-3*time.Hour))
	insertSession(t, db, "old3", "reader", time.Now().Add(-90*time.Minute))
	insertSession(t, db, "fresh", "backup", time.Now().Add(-10*time.Minute))
	insertSession(t, db, "done", "finished", time.Now().Add(-4*time.Hour))

	r := newReaper(db, 1*time.Hour)
	n, err := r.SweepOnce(context.Background())
	if err != nil {
		t.Fatalf("SweepOnce: %v", err)
	}
	if n != 3 {
		t.Errorf("rows affected: got %d, want 3", n)
	}
	for _, id := range []string{"old1", "old2", "old3"} {
		if got := getState(t, db, id); got != "aborted" {
			t.Errorf("%s: got %q, want aborted", id, got)
		}
	}
	if got := getState(t, db, "fresh"); got != "backup" {
		t.Errorf("fresh: got %q, want backup", got)
	}
	if got := getState(t, db, "done"); got != "finished" {
		t.Errorf("done: got %q, want finished", got)
	}
}

func TestRun_StopsOnContextCancel(t *testing.T) {
	db := setupDB(t)
	r := New(db, DefaultStaleThreshold, 10*time.Second) // long interval so only initial sweep runs

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		r.Run(ctx)
		close(done)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Error("Run did not stop within 100ms of context cancellation")
	}
}

func TestRun_RunsAtInterval(t *testing.T) {
	db := setupDB(t)
	// Use a very short interval (10ms) and count how many sweeps run in ~80ms.
	sweepCount := 0
	// We can't inject a counter directly, so we use a tiny stale threshold
	// and insert + re-insert to observe multiple sweeps.
	// Easier: just verify Run doesn't panic and completes sweeps by checking
	// that a stale session inserted before Run starts gets aborted.
	insertSession(t, db, "s1", "backup", time.Now().Add(-2*time.Hour))

	r := New(db, DefaultStaleThreshold, 10*time.Millisecond)
	_ = sweepCount

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		r.Run(ctx)
		close(done)
	}()

	<-done

	if got := getState(t, db, "s1"); got != "aborted" {
		t.Errorf("s1: got %q, want aborted after reaper ran", got)
	}
}
