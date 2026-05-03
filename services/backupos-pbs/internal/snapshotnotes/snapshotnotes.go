// Package snapshotnotes implements GET and PUT /api2/json/admin/datastore/<store>/notes.
//
// Notes are stored in the pbs_snapshots.notes column. The snapshot row must
// already exist (inserted by POST /finish) — both methods return 404 if not.
//
// GET  returns the notes string (empty string if NULL).
// PUT  updates notes from the ?notes= query parameter.
package snapshotnotes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshotlocator"
)

// Handler serves GET and PUT /api2/json/admin/datastore/<store>/notes.
type Handler struct {
	datastores *datastore.Lookup
	db         *sql.DB
}

// NewHandler constructs a notes Handler.
func NewHandler(ds *datastore.Lookup, db *sql.DB) *Handler {
	return &Handler{datastores: ds, db: db}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleGet(w, r)
	case http.MethodPut:
		h.handlePut(w, r)
	default:
		w.Header().Set("Allow", "GET, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleGet(w http.ResponseWriter, r *http.Request) {
	res, status, err := snapshotlocator.FromRequest(r, "/notes", h.datastores)
	if err != nil {
		slog.Info("notes GET: locate failed", "error", err)
		http.Error(w, err.Error(), status)
		return
	}

	notes, err := h.queryNotes(res.Datastore.ID, r.URL.Query().Get("backup-type"),
		r.URL.Query().Get("backup-id"), res.BackupTime.UnixMilli())
	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "snapshot not found in database", http.StatusNotFound)
		return
	}
	if err != nil {
		slog.Error("notes GET: db query failed", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": notes})
}

func (h *Handler) handlePut(w http.ResponseWriter, r *http.Request) {
	res, status, err := snapshotlocator.FromRequest(r, "/notes", h.datastores)
	if err != nil {
		slog.Info("notes PUT: locate failed", "error", err)
		http.Error(w, err.Error(), status)
		return
	}

	newNotes := r.URL.Query().Get("notes")

	updated, err := h.updateNotes(res.Datastore.ID, r.URL.Query().Get("backup-type"),
		r.URL.Query().Get("backup-id"), res.BackupTime.UnixMilli(), newNotes)
	if err != nil {
		slog.Error("notes PUT: db update failed", "error", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if !updated {
		http.Error(w, "snapshot not found in database", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

func (h *Handler) queryNotes(datastoreID, backupType, backupID string, backupTimeMs int64) (string, error) {
	const q = `
		SELECT COALESCE(notes, '')
		FROM pbs_snapshots
		WHERE datastore_id = ? AND backup_type = ? AND backup_id = ? AND backup_time = ?
		LIMIT 1
	`
	var notes string
	err := h.db.QueryRow(q, datastoreID, backupType, backupID, backupTimeMs).Scan(&notes)
	return notes, err
}

func (h *Handler) updateNotes(datastoreID, backupType, backupID string, backupTimeMs int64, notes string) (bool, error) {
	const q = `
		UPDATE pbs_snapshots
		SET notes = ?
		WHERE datastore_id = ? AND backup_type = ? AND backup_id = ? AND backup_time = ?
	`
	res, err := h.db.Exec(q, notes, datastoreID, backupType, backupID, backupTimeMs)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}
