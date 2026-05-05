package jobsync

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE backup_jobs (
			id TEXT PRIMARY KEY,
			name TEXT, source_type TEXT, source_config TEXT,
			schedule TEXT, enabled INTEGER, preflight_enabled INTEGER, created_at INTEGER,
			last_run_at INTEGER, last_run_status TEXT
		);
		CREATE TABLE backup_runs (
			id TEXT PRIMARY KEY, job_id TEXT, status TEXT, trigger TEXT,
			started_at INTEGER, run_type TEXT,
			completed_at INTEGER, duration INTEGER, total_size INTEGER, snapshot_id TEXT, error_message TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestJobID_RootNamespace(t *testing.T) {
	got := JobID("ds-1", namespace.Root(), "vm", "100")
	want := "pbs_ds-1_root_vm_100"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestJobID_NonRootNamespace(t *testing.T) {
	ns, err := namespace.Parse("tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	got := JobID("ds-1", ns, "vm", "100")
	want := "pbs_ds-1_tenant-a_vm_100"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestJobName_RootVsNonRoot(t *testing.T) {
	if got := JobName(namespace.Root(), "vm", "100"); got != "PVE: vm/100" {
		t.Errorf("root: got %q", got)
	}
	ns, _ := namespace.Parse("tenant-a")
	if got := JobName(ns, "vm", "100"); got != "PVE: tenant-a/vm/100" {
		t.Errorf("non-root: got %q", got)
	}
}

func TestUpsertJob_InsertsRow(t *testing.T) {
	db := openDB(t)
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}

	var id, name, sourceType string
	err := db.QueryRow(`SELECT id, name, source_type FROM backup_jobs WHERE id = ?`, "pbs_ds-1_root_vm_100").
		Scan(&id, &name, &sourceType)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if id != "pbs_ds-1_root_vm_100" {
		t.Errorf("id: got %q", id)
	}
	if name != "PVE: vm/100" {
		t.Errorf("name: got %q", name)
	}
	if sourceType != "proxmox_vm" {
		t.Errorf("source_type: got %q", sourceType)
	}
}

func TestUpsertJob_DoesNotUpdateExisting(t *testing.T) {
	db := openDB(t)

	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	// Manually tweak the row to verify it's left unchanged.
	if _, err := db.Exec(`UPDATE backup_jobs SET name = 'custom' WHERE id = ?`, "pbs_ds-1_root_vm_100"); err != nil {
		t.Fatal(err)
	}
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}

	var name string
	_ = db.QueryRow(`SELECT name FROM backup_jobs WHERE id = ?`, "pbs_ds-1_root_vm_100").Scan(&name)
	if name != "custom" {
		t.Errorf("expected row unchanged (name='custom'), got %q", name)
	}
}

func TestInsertRunningRun_InsertsRow(t *testing.T) {
	db := openDB(t)
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}

	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	startedAt := time.Unix(1735000000, 0)
	runID, err := InsertRunningRun(db, jobID, startedAt)
	if err != nil {
		t.Fatal(err)
	}
	if runID == "" {
		t.Fatal("expected non-empty runID")
	}

	var status, trigger, runType string
	var gotStartedAt int64
	err = db.QueryRow(`SELECT status, trigger, started_at, run_type FROM backup_runs WHERE id = ?`, runID).
		Scan(&status, &trigger, &gotStartedAt, &runType)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if status != "running" {
		t.Errorf("status: got %q", status)
	}
	if trigger != "api" {
		t.Errorf("trigger: got %q", trigger)
	}
	if runType != "backup" {
		t.Errorf("run_type: got %q", runType)
	}
	if gotStartedAt != startedAt.UnixMilli() {
		t.Errorf("started_at: got %d, want %d", gotStartedAt, startedAt.UnixMilli())
	}
}

func TestFinishRun_Success(t *testing.T) {
	db := openDB(t)
	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	startedAt := time.Unix(1735000000, 0)
	runID, _ := InsertRunningRun(db, jobID, startedAt)

	snapID := "snap-abc"
	completedAt := time.Unix(1735000060, 0)
	if err := FinishRun(db, runID, jobID, "success", &snapID, nil, nil, startedAt, completedAt); err != nil {
		t.Fatal(err)
	}

	var status string
	var snapshotID sql.NullString
	_ = db.QueryRow(`SELECT status, snapshot_id FROM backup_runs WHERE id = ?`, runID).
		Scan(&status, &snapshotID)
	if status != "success" {
		t.Errorf("status: got %q", status)
	}
	if !snapshotID.Valid || snapshotID.String != "snap-abc" {
		t.Errorf("snapshot_id: got %v", snapshotID)
	}

	var lastRunStatus string
	_ = db.QueryRow(`SELECT last_run_status FROM backup_jobs WHERE id = ?`, jobID).Scan(&lastRunStatus)
	if lastRunStatus != "success" {
		t.Errorf("last_run_status: got %q", lastRunStatus)
	}
}

func TestFinishRun_Failed(t *testing.T) {
	db := openDB(t)
	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	startedAt := time.Unix(1735000000, 0)
	runID, _ := InsertRunningRun(db, jobID, startedAt)

	errMsg := "connection closed without /finish"
	completedAt := time.Unix(1735000030, 0)
	if err := FinishRun(db, runID, jobID, "failed", nil, &errMsg, nil, startedAt, completedAt); err != nil {
		t.Fatal(err)
	}

	var status string
	var errorMessage sql.NullString
	_ = db.QueryRow(`SELECT status, error_message FROM backup_runs WHERE id = ?`, runID).
		Scan(&status, &errorMessage)
	if status != "failed" {
		t.Errorf("status: got %q", status)
	}
	if !errorMessage.Valid || errorMessage.String != errMsg {
		t.Errorf("error_message: got %v", errorMessage)
	}
}

func TestFinishRun_DurationCalculation(t *testing.T) {
	db := openDB(t)
	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	startedAt := time.Unix(1735000000, 0)
	completedAt := startedAt.Add(90 * time.Second)
	runID, _ := InsertRunningRun(db, jobID, startedAt)

	if err := FinishRun(db, runID, jobID, "success", nil, nil, nil, startedAt, completedAt); err != nil {
		t.Fatal(err)
	}

	var duration int64
	_ = db.QueryRow(`SELECT duration FROM backup_runs WHERE id = ?`, runID).Scan(&duration)
	if duration != 90000 {
		t.Errorf("duration: got %d, want 90000", duration)
	}
}

// ── webhook tests ─────────────────────────────────────────────────────────────

func resetWebhookConfig(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		internalURL = ""
		internalSecret = ""
	})
}

func TestFireWebhook_SuccessStatus(t *testing.T) {
	resetWebhookConfig(t)

	var received atomic.Int32
	var gotBody map[string]string
	var gotAuth string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Add(1)
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	SetWebhookConfig(srv.URL, "test-secret")
	fireWebhook("run-1", "success", nil)

	if received.Load() != 1 {
		t.Fatalf("expected 1 request, got %d", received.Load())
	}
	if gotAuth != "Bearer test-secret" {
		t.Errorf("auth header: got %q, want %q", gotAuth, "Bearer test-secret")
	}
	if gotBody["event"] != "backup_succeeded" {
		t.Errorf("event: got %q, want backup_succeeded", gotBody["event"])
	}
	if gotBody["runId"] != "run-1" {
		t.Errorf("runId: got %q, want run-1", gotBody["runId"])
	}
}

func TestFireWebhook_FailedStatus(t *testing.T) {
	resetWebhookConfig(t)

	var gotBody map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	SetWebhookConfig(srv.URL, "test-secret")
	errMsg := "disk full"
	fireWebhook("run-2", "failed", &errMsg)

	if gotBody["event"] != "backup_failed" {
		t.Errorf("event: got %q, want backup_failed", gotBody["event"])
	}
	if gotBody["error"] != "disk full" {
		t.Errorf("error: got %q, want disk full", gotBody["error"])
	}
}

func TestFireWebhook_UnknownStatus_NoOp(t *testing.T) {
	resetWebhookConfig(t)

	var received atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	SetWebhookConfig(srv.URL, "test-secret")
	fireWebhook("run-3", "cancelled", nil)

	if received.Load() != 0 {
		t.Errorf("expected 0 requests for cancelled status, got %d", received.Load())
	}
}

func TestFireWebhook_NoConfig_NoOp(t *testing.T) {
	resetWebhookConfig(t)
	// internalURL and internalSecret are empty — must not panic
	fireWebhook("run-4", "success", nil)
}

func TestFireWebhook_AuthFailure_LogsButDoesntPanic(t *testing.T) {
	resetWebhookConfig(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	SetWebhookConfig(srv.URL, "wrong-secret")
	// Must not panic; non-2xx is logged and swallowed
	fireWebhook("run-5", "success", nil)
}

func TestFinishRun_TotalSize(t *testing.T) {
	db := openDB(t)
	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	startedAt := time.Unix(1735000000, 0)
	completedAt := startedAt.Add(60 * time.Second)
	runID, _ := InsertRunningRun(db, jobID, startedAt)

	var size int64 = 1024 * 1024 * 512 // 512 MiB
	if err := FinishRun(db, runID, jobID, "success", nil, nil, &size, startedAt, completedAt); err != nil {
		t.Fatal(err)
	}

	var got sql.NullInt64
	_ = db.QueryRow(`SELECT total_size FROM backup_runs WHERE id = ?`, runID).Scan(&got)
	if !got.Valid || got.Int64 != size {
		t.Errorf("total_size: got %v, want %d", got, size)
	}
}

func TestFinishRun_NilTotalSize(t *testing.T) {
	db := openDB(t)
	jobID := JobID("ds-1", namespace.Root(), "vm", "100")
	if err := UpsertJob(db, "ds-1", namespace.Root(), "vm", "100"); err != nil {
		t.Fatal(err)
	}
	startedAt := time.Unix(1735000000, 0)
	runID, _ := InsertRunningRun(db, jobID, startedAt)

	if err := FinishRun(db, runID, jobID, "failed", nil, nil, nil, startedAt, startedAt); err != nil {
		t.Fatal(err)
	}

	var got sql.NullInt64
	_ = db.QueryRow(`SELECT total_size FROM backup_runs WHERE id = ?`, runID).Scan(&got)
	if got.Valid {
		t.Errorf("total_size: got valid %d, want NULL", got.Int64)
	}
}
