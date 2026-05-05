// Package jobsync synthesises backup_jobs and backup_runs rows for PBS sessions.
//
// PBS-protocol backups (PVE → backupos-pbs) don't go through the normal
// backup-job scheduler, so they would be invisible in the web UI. This
// package bridges that gap by creating a synthetic Job per unique backup tuple
// and a Run per session. All operations are best-effort: callers log errors
// but don't fail the backup on DB errors.
package jobsync

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

var (
	internalURL    string
	internalSecret string
)

// SetWebhookConfig configures the internal webhook target.
// Called once at startup from main.go. Empty url disables webhook.
func SetWebhookConfig(url, secret string) {
	internalURL = url
	internalSecret = secret
}

// JobID returns the deterministic synthetic Job ID for a backup tuple.
// Format: pbs_<datastoreID>_<namespace_or_root>_<backupType>_<backupID>
// Uses underscore instead of colon to avoid URL-routing edge cases when
// the ID becomes a dynamic route segment in the web UI.
func JobID(datastoreID string, ns namespace.Namespace, backupType, backupID string) string {
	nsPart := "root"
	if !ns.IsRoot() {
		nsPart = ns.String()
	}
	return fmt.Sprintf("pbs_%s_%s_%s_%s", datastoreID, nsPart, backupType, backupID)
}

// JobName returns the human-friendly display name.
// Root namespace: "PVE: vm/100"
// Non-root:       "PVE: tenant-a/vm/100"
func JobName(ns namespace.Namespace, backupType, backupID string) string {
	if ns.IsRoot() {
		return fmt.Sprintf("PVE: %s/%s", backupType, backupID)
	}
	return fmt.Sprintf("PVE: %s/%s/%s", ns.String(), backupType, backupID)
}

// sourceTypeFor maps a PBS backup_type to the closest backup_jobs.source_type.
func sourceTypeFor(backupType string) string {
	if backupType == "vm" {
		return "proxmox_vm"
	}
	return "proxmox_lxc"
}

// UpsertJob inserts the synthetic Job if it doesn't already exist.
// On conflict the existing row is left unchanged (ON CONFLICT DO NOTHING).
func UpsertJob(db *sql.DB, datastoreID string, ns namespace.Namespace, backupType, backupID string) error {
	jobID := JobID(datastoreID, ns, backupType, backupID)
	sourceConfig, _ := json.Marshal(map[string]string{
		"datastore_id": datastoreID,
		"namespace":    ns.String(),
		"backup_id":    backupID,
		"source":       "pbs_protocol",
	})
	const q = `
		INSERT INTO backup_jobs
			(id, name, source_type, source_config, schedule, enabled,
			 preflight_enabled, created_at)
		VALUES (?, ?, ?, ?, '', 0, 0, ?)
		ON CONFLICT(id) DO NOTHING
	`
	_, err := db.Exec(q,
		jobID, JobName(ns, backupType, backupID),
		sourceTypeFor(backupType), string(sourceConfig),
		time.Now().UnixMilli(),
	)
	return err
}

// InsertRunningRun inserts a backup_runs row in 'running' state and returns the new run ID.
func InsertRunningRun(db *sql.DB, jobID string, startedAt time.Time) (string, error) {
	runID := uuid.NewString()
	const q = `
		INSERT INTO backup_runs
			(id, job_id, status, trigger, started_at, run_type)
		VALUES (?, ?, 'running', 'api', ?, 'backup')
	`
	_, err := db.Exec(q, runID, jobID, startedAt.UnixMilli())
	return runID, err
}

// FinishRun marks a run as completed (success or failed) and updates the parent Job.
// snapshotID, errorMessage, and totalSize may be nil for the unused branch.
func FinishRun(db *sql.DB, runID, jobID, status string, snapshotID, errorMessage *string, totalSize *int64, startedAt, completedAt time.Time) error {
	durationMs := completedAt.Sub(startedAt).Milliseconds()
	const updateRun = `
		UPDATE backup_runs
		SET status = ?, completed_at = ?, duration = ?, total_size = ?, snapshot_id = ?, error_message = ?
		WHERE id = ?
	`
	if _, err := db.Exec(updateRun, status, completedAt.UnixMilli(), durationMs,
		nullableInt64(totalSize),
		nullableString(snapshotID), nullableString(errorMessage), runID); err != nil {
		return fmt.Errorf("update run: %w", err)
	}
	const updateJob = `
		UPDATE backup_jobs
		SET last_run_at = ?, last_run_status = ?
		WHERE id = ?
	`
	if _, err := db.Exec(updateJob, completedAt.UnixMilli(), status, jobID); err != nil {
		return fmt.Errorf("update job: %w", err)
	}
	// Fire-and-forget: webhook is best-effort, must not block FinishRun.
	// See #304. Panic-recover guards against any future change in fireWebhook
	// or its dependencies that could panic on bad input.
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("jobsync: webhook goroutine panic", "panic", r, "runID", runID)
			}
		}()
		fireWebhook(runID, status, errorMessage)
	}()
	return nil
}

// fireWebhook is best-effort: never blocks the FinishRun success path,
// even on network/auth errors. Logged loudly so deployment misconfigs
// are visible. No retries — alerts are nice-to-have, not critical path.
func fireWebhook(runID, status string, errMsg *string) {
	if internalURL == "" || internalSecret == "" {
		return // not configured; e.g. test environment
	}

	var event string
	switch status {
	case "success":
		event = "backup_succeeded"
	case "failed":
		event = "backup_failed"
	default:
		return // running, cancelled, etc.
	}

	body := map[string]string{
		"event": event,
		"runId": runID,
	}
	if errMsg != nil {
		body["error"] = *errMsg
	}

	payload, err := json.Marshal(body)
	if err != nil {
		slog.Error("jobsync: webhook marshal failed", "error", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost,
		internalURL+"/api/internal/alerts",
		bytes.NewReader(payload))
	if err != nil {
		slog.Error("jobsync: webhook request build failed", "error", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+internalSecret)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("jobsync: webhook delivery failed", "error", err, "url", internalURL)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Error("jobsync: webhook returned non-2xx",
			"status", resp.StatusCode, "run_id", runID)
	}
}

func nullableString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func nullableInt64(v *int64) any {
	if v == nil {
		return nil
	}
	return *v
}
