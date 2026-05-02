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
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// Handler implements POST /finish.
type Handler struct {
	sessions *session.Store
}

// NewHandler constructs a finish handler.
func NewHandler(sessions *session.Store) *Handler {
	return &Handler{sessions: sessions}
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
