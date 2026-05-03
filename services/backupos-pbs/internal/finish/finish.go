// Package finish implements the POST /finish endpoint.
//
// PBS clients call POST /finish after uploading all blobs, indexes, and
// chunks. The server marks the session as 'finished' (vs 'aborted' which
// is what happens if the connection closes without /finish) and fsyncs
// the snapshot directory for durability.
//
// The client uploads index.json.blob via POST /blob immediately before
// /finish. The server does NOT generate index.json — that's the client's
// responsibility per the PBS protocol.
package finish

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/jobsync"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// Handler implements POST /finish.
type Handler struct {
	sessions *session.Store
	db       *sql.DB
}

// NewHandler constructs a finish handler.
func NewHandler(sessions *session.Store, db *sql.DB) *Handler {
	return &Handler{sessions: sessions, db: db}
}

// ServeHTTP routes POST /finish → mark session finished, fsync snapshot dir, 200.
// Any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("finish handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Transition state: 'backup'/'reader' → 'finished'
	updated, err := h.sessions.Finish(sc.SessionID)
	if err != nil {
		slog.Error("session finish DB update failed",
			"error", err,
			"session_id", sc.SessionID,
		)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !updated {
		// Session already finished or already aborted.
		slog.Info("finish rejected: session not in active state",
			"session_id", sc.SessionID,
		)
		writeError(w, http.StatusBadRequest, "session not active")
		return
	}

	// Insert / upsert the pbs_snapshots row. This is best-effort: if the
	// DB write fails the files are still on disk and can be re-indexed later.
	h.insertSnapshot(sc)

	// Finalize the synthetic run row if one was created at upgrade time.
	if sc.RunID != "" {
		snapshotID := buildSnapshotID(sc.DatastoreID, sc.Namespace, sc.BackupType, sc.BackupID, sc.BackupTime)
		if err := jobsync.FinishRun(h.db, sc.RunID, sc.JobID, "ok",
			&snapshotID, nil, sc.SessionStartedAt, time.Now()); err != nil {
			slog.Error("finish: FinishRun failed (backup still saved)",
				"error", err, "run_id", sc.RunID)
		}
	}

	// Best-effort durability: fsync the snapshot directory.
	snapDir, pathErr := snapshot.Path(sc.DatastoreRoot, sc.Namespace, sc.BackupType, sc.BackupID, sc.BackupTime)
	if pathErr != nil {
		// Path validation failure here is unexpected — upgrade.ParseParams
		// already validated the same fields. Log and continue.
		slog.Warn("finish: snapshot path computation failed",
			"error", pathErr,
			"session_id", sc.SessionID,
		)
	} else if err := fsyncDir(snapDir); err != nil {
		// Best-effort. Blob handler also fsyncs after each write so
		// per-blob durability is already in place.
		slog.Warn("finish: snapshot dir fsync failed (state still transitioned)",
			"error", err,
			"session_id", sc.SessionID,
			"snapshot_dir", snapDir,
		)
	}

	slog.Info("session finished",
		"session_id", sc.SessionID,
		"datastore_id", sc.DatastoreID,
		"backup_type", sc.BackupType,
		"backup_id", sc.BackupID,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

// insertSnapshot upserts a pbs_snapshots row for the completed backup.
// Errors are logged but do not affect the HTTP response — disk is the
// source of truth and the row can be re-inserted later.
func (h *Handler) insertSnapshot(sc *streamctx.SessionContext) {
	snapshotID := buildSnapshotID(sc.DatastoreID, sc.Namespace, sc.BackupType, sc.BackupID, sc.BackupTime)
	namespaceID := h.resolveNamespaceID(sc.DatastoreID, sc.Namespace)

	// Future: decode index.json.blob (magic + zstd) and store the JSON.
	// For now leave NULL; the snapshot row is what /notes and listing need.
	var manifest sql.NullString

	const insert = `
		INSERT INTO pbs_snapshots
			(id, datastore_id, namespace_id, backup_type, backup_id, backup_time,
			 finished_at, manifest, total_size_bytes, unique_size_bytes, protected, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
		ON CONFLICT(id) DO UPDATE SET
			finished_at = excluded.finished_at,
			manifest = excluded.manifest,
			total_size_bytes = excluded.total_size_bytes,
			unique_size_bytes = excluded.unique_size_bytes
	`
	_, err := h.db.Exec(insert,
		snapshotID, sc.DatastoreID, namespaceID,
		sc.BackupType, sc.BackupID, sc.BackupTime.UnixMilli(),
		time.Now().UnixMilli(), manifest,
		nil, nil, // total_size_bytes, unique_size_bytes — TODO when stats land
	)
	if err != nil {
		slog.Error("finish: pbs_snapshots insert failed (snapshot still on disk)",
			"error", err,
			"session_id", sc.SessionID,
			"snapshot_id", snapshotID,
		)
		return
	}
	slog.Info("snapshot row inserted",
		"snapshot_id", snapshotID,
		"session_id", sc.SessionID,
	)
}

// buildSnapshotID constructs a deterministic primary key for a snapshot.
// Format: <datastoreID>:<namespace>:<backupType>/<backupID>/<iso8601>
// Matches the on-disk directory name format for easy cross-reference.
func buildSnapshotID(datastoreID string, ns namespace.Namespace, backupType, backupID string, t time.Time) string {
	nsPart := ""
	if !ns.IsRoot() {
		nsPart = ns.String()
	}
	return fmt.Sprintf("%s:%s:%s/%s/%s",
		datastoreID, nsPart, backupType, backupID,
		t.UTC().Format("2006-01-02T15:04:05Z"))
}

// resolveNamespaceID returns the row id of the matching namespace, or NULL
// if root namespace, missing, or on lookup error.
func (h *Handler) resolveNamespaceID(datastoreID string, ns namespace.Namespace) sql.NullString {
	if ns.IsRoot() {
		return sql.NullString{}
	}
	const q = `SELECT id FROM pbs_namespaces WHERE datastore_id = ? AND name = ? LIMIT 1`
	var id string
	err := h.db.QueryRow(q, datastoreID, ns.String()).Scan(&id)
	if err != nil {
		slog.Warn("finish: namespace lookup failed; inserting NULL",
			"error", err, "datastore_id", datastoreID, "namespace", ns.String())
		return sql.NullString{}
	}
	return sql.NullString{String: id, Valid: true}
}

// fsyncDir fsyncs a directory inode for durability of recent renames.
// If the directory doesn't exist (degenerate session with no uploads), it's a no-op.
func fsyncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer d.Close()
	return d.Sync()
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
