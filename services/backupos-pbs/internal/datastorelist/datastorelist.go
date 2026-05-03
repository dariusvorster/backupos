// Package datastorelist implements GET /api2/json/admin/datastore.
//
// PVE's "Add Proxmox Backup Server" UI calls this endpoint to enumerate
// available datastores after the operator submits the storage-add dialog.
// Real PBS returns:
//
//	{"data":[{"store":"default", "comment":"..."}, ...]}
//
// We return the same shape with the "store" field populated. "comment" is
// included as an empty string for compatibility; populate it when the
// pbs_datastores schema gains a comment column.
package datastorelist

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

// Handler serves GET /api2/json/admin/datastore.
type Handler struct {
	db *sql.DB
}

// NewHandler constructs a Handler.
func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
}

type datastoreEntry struct {
	Store   string `json:"store"`
	Comment string `json:"comment"`
}

// ServeHTTP returns the list of datastores in the format expected by PVE.
//
// Auth is enforced by the requireAuth wrapper at registration time; this
// handler runs only after the caller has presented a valid token.
//
// Authorization: any authenticated token can list datastores. Real PBS
// scopes this by Datastore.Audit privilege; we do not yet implement
// per-datastore ACLs in the protocol layer, so all tokens see all
// datastores. Track as a follow-up when the privilege model lands.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := h.db.Query(`SELECT name FROM pbs_datastores ORDER BY name ASC`)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	entries := []datastoreEntry{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		entries = append(entries, datastoreEntry{Store: name, Comment: ""})
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": entries})
}
