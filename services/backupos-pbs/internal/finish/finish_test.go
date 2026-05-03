package finish

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

func setupTestStore(t *testing.T) (*sql.DB, *session.Store) {
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
			scratch_path  TEXT,
			namespace      TEXT NOT NULL DEFAULT ''
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db, session.NewStore(db)
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
			namespace_id TEXT,
			backup_type TEXT,
			backup_id TEXT,
			backup_time INTEGER,
			finished_at INTEGER,
			manifest TEXT,
			total_size_bytes INTEGER,
			unique_size_bytes INTEGER,
			protected INTEGER DEFAULT 0,
			notes TEXT
		);
		CREATE TABLE pbs_namespaces (
			id TEXT PRIMARY KEY,
			datastore_id TEXT,
			name TEXT
		);
		CREATE TABLE backup_jobs (
			id TEXT PRIMARY KEY,
			name TEXT, source_type TEXT, source_config TEXT,
			schedule TEXT, enabled INTEGER, preflight_enabled INTEGER, created_at INTEGER,
			last_run_at INTEGER, last_run_status TEXT
		);
		CREATE TABLE backup_runs (
			id TEXT PRIMARY KEY, job_id TEXT, status TEXT, trigger TEXT,
			started_at INTEGER, run_type TEXT,
			completed_at INTEGER, duration INTEGER, snapshot_id TEXT, error_message TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// setupFull returns a session DB, a snapshot DB, and a session store.
// Used by tests that need both DB handles.
func setupFull(t *testing.T) (*sql.DB, *sql.DB, *session.Store) {
	t.Helper()
	sessDB, store := setupTestStore(t)
	snapDB := openTestDB(t)
	return sessDB, snapDB, store
}

func makeReq(t *testing.T, sc *streamctx.SessionContext) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/finish", nil)
	if sc != nil {
		r = r.WithContext(streamctx.WithSession(context.Background(), sc))
	}
	return r
}

func TestHandler_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	sessDB, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	id, err := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	if err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if v, ok := resp["data"]; !ok || v != nil {
		t.Errorf(`expected {"data":null}, got %v`, resp)
	}

	var gotState string
	_ = sessDB.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "finished" {
		t.Errorf("state: got %q, want finished", gotState)
	}
}

func TestHandler_GETReturns405(t *testing.T) {
	_, store := setupTestStore(t)
	h := NewHandler(store, openTestDB(t))
	r := httptest.NewRequest(http.MethodGet, "/finish", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandler_MissingStreamCtx(t *testing.T) {
	_, store := setupTestStore(t)
	h := NewHandler(store, openTestDB(t))
	r := httptest.NewRequest(http.MethodPost, "/finish", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 without streamctx, got %d", w.Code)
	}
}

func TestHandler_DoubleFinishRejected(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}

	w1 := httptest.NewRecorder()
	h.ServeHTTP(w1, makeReq(t, sc))
	if w1.Code != http.StatusOK {
		t.Fatalf("first finish: expected 200, got %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, makeReq(t, sc))
	if w2.Code != http.StatusBadRequest {
		t.Errorf("second finish: expected 400, got %d. Body: %s", w2.Code, w2.Body.String())
	}
	if !strings.Contains(w2.Body.String(), "not active") {
		t.Errorf("expected 'not active' in response, got %s", w2.Body.String())
	}
}

func TestHandler_FinishOnAbortedSessionRejected(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	if _, err := store.Finalize(id); err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_NoSnapshotDirIsOK(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	// Do NOT create the snapshot dir — finish should still return 200
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 even without snapshot dir, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestFinish_InsertsPbsSnapshotsRow(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	backupTime := time.Unix(1735000000, 0)
	id, err := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: backupTime, Kind: session.KindBackup,
	})
	if err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: backupTime,
	}
	before := time.Now().UnixMilli()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	after := time.Now().UnixMilli()

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var (
		gotDatastoreID string
		gotBackupType  string
		gotBackupID    string
		gotBackupTime  int64
		gotFinishedAt  int64
		gotNotes       sql.NullString
		gotProtected   int
	)
	err = snapDB.QueryRow(`
		SELECT datastore_id, backup_type, backup_id, backup_time, finished_at, notes, protected
		FROM pbs_snapshots
		WHERE datastore_id = 'ds-1'
	`).Scan(&gotDatastoreID, &gotBackupType, &gotBackupID, &gotBackupTime, &gotFinishedAt, &gotNotes, &gotProtected)
	if err != nil {
		t.Fatalf("pbs_snapshots query: %v", err)
	}

	if gotDatastoreID != "ds-1" {
		t.Errorf("datastore_id: got %q", gotDatastoreID)
	}
	if gotBackupType != "vm" {
		t.Errorf("backup_type: got %q", gotBackupType)
	}
	if gotBackupID != "100" {
		t.Errorf("backup_id: got %q", gotBackupID)
	}
	if gotBackupTime != backupTime.UnixMilli() {
		t.Errorf("backup_time: got %d, want %d", gotBackupTime, backupTime.UnixMilli())
	}
	if gotFinishedAt < before || gotFinishedAt > after {
		t.Errorf("finished_at %d not in [%d, %d]", gotFinishedAt, before, after)
	}
	if gotNotes.Valid {
		t.Errorf("notes should be NULL")
	}
	if gotProtected != 0 {
		t.Errorf("protected should be 0, got %d", gotProtected)
	}
}

func TestFinish_DuplicateInsertIsIdempotent(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	backupTime := time.Unix(1735000000, 0)
	snapshotID := buildSnapshotID("ds-1", namespace.Root(), "vm", "100", backupTime)

	// Pre-insert a row with the same id and an old finished_at.
	_, err := snapDB.Exec(`
		INSERT INTO pbs_snapshots (id, datastore_id, backup_type, backup_id, backup_time, finished_at, protected)
		VALUES (?, 'ds-1', 'vm', '100', ?, 1000, 0)
	`, snapshotID, backupTime.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: backupTime, Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: backupTime,
	}

	before := time.Now().UnixMilli()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	after := time.Now().UnixMilli()

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var count int
	_ = snapDB.QueryRow(`SELECT COUNT(*) FROM pbs_snapshots`).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 row, got %d", count)
	}

	// finished_at should have been updated from 1000 to now.
	var finishedAt int64
	_ = snapDB.QueryRow(`SELECT finished_at FROM pbs_snapshots WHERE id = ?`, snapshotID).Scan(&finishedAt)
	if finishedAt < before || finishedAt > after {
		t.Errorf("finished_at not updated: got %d, want in [%d, %d]", finishedAt, before, after)
	}
}

func TestFinish_DBInsertFailureStillReturns200(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)

	// Drop the snapshots table so the insert will fail.
	if _, err := snapDB.Exec(`DROP TABLE pbs_snapshots`); err != nil {
		t.Fatal(err)
	}

	h := NewHandler(store, snapDB)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 even on DB failure, got %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if v, ok := resp["data"]; !ok || v != nil {
		t.Errorf(`expected {"data":null}, got %v`, resp)
	}
}

func TestFinish_FinalizesSyntheticRun(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	jobID := "pbs_ds-1_root_vm_100"
	runID := "test-run-uuid"
	startedAt := time.Unix(1735000000, 0)
	backupTime := time.Unix(1735000100, 0)

	if _, err := snapDB.Exec(
		`INSERT INTO backup_jobs (id, name, source_type, source_config, schedule, enabled, preflight_enabled, created_at) VALUES (?, 'test', 'proxmox_vm', '{}', '', 0, 0, 1735000000000)`,
		jobID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := snapDB.Exec(
		`INSERT INTO backup_runs (id, job_id, status, trigger, started_at, run_type) VALUES (?, ?, 'running', 'api', 1735000000000, 'backup')`,
		runID, jobID,
	); err != nil {
		t.Fatal(err)
	}

	id, err := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: backupTime, Kind: session.KindBackup,
	})
	if err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: backupTime,
		JobID: jobID, RunID: runID, SessionStartedAt: startedAt,
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var runStatus string
	_ = snapDB.QueryRow(`SELECT status FROM backup_runs WHERE id = ?`, runID).Scan(&runStatus)
	if runStatus != "success" {
		t.Errorf("run status: got %q, want 'success'", runStatus)
	}

	var lastRunStatus string
	_ = snapDB.QueryRow(`SELECT last_run_status FROM backup_jobs WHERE id = ?`, jobID).Scan(&lastRunStatus)
	if lastRunStatus != "success" {
		t.Errorf("job last_run_status: got %q, want 'success'", lastRunStatus)
	}
}

func TestFinish_NamespaceLookupReturnsNullOnMiss(t *testing.T) {
	tmp := t.TempDir()
	_, snapDB, store := setupFull(t)
	h := NewHandler(store, snapDB)

	backupTime := time.Unix(1735000000, 0)
	ns, err := namespace.Parse("tenant-a")
	if err != nil {
		t.Fatal(err)
	}

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "ct", BackupID: "200",
		BackupTime: backupTime, Kind: session.KindBackup,
		Namespace: ns.String(),
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "ct", BackupID: "200", BackupTime: backupTime,
		Namespace: ns,
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var namespaceID sql.NullString
	err = snapDB.QueryRow(`SELECT namespace_id FROM pbs_snapshots WHERE backup_type = 'ct'`).Scan(&namespaceID)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if namespaceID.Valid {
		t.Errorf("expected namespace_id to be NULL when namespace row missing, got %q", namespaceID.String)
	}
}
