// Package previoustime implements GET /previous_backup_time.
//
// Returns the Unix timestamp of the previous successful backup in this group,
// or {"data":null} if none exists.
package previoustime

import (
	"encoding/json"
	"net/http"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// Handler serves GET /previous_backup_time.
type Handler struct{}

// NewHandler constructs a previoustime Handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP handles GET /previous_backup_time.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if sc.PreviousBackup == nil {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"data": nil})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"data": sc.PreviousBackup.Time.Unix(),
	})
}
