// Package datastorestatus implements GET /api2/json/admin/datastore/<store>/status.
//
// PVE polls this endpoint every 10 seconds to display storage health.
// Required fields: total / used / avail (bytes). Other fields are
// optional but populated with sensible defaults so PVE's UI renders fully.
package datastorestatus

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"syscall"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

type Handler struct {
	datastores *datastore.Lookup
}

func NewHandler(ds *datastore.Lookup) *Handler {
	return &Handler{datastores: ds}
}

type gcStatus struct {
	UPID           string `json:"upid"`
	LastRunEndtime int64  `json:"last-run-endtime"`
	LastRunState   string `json:"last-run-state"`
}

type countEntry struct {
	Snapshots int   `json:"snapshots"`
	Size      int64 `json:"size"`
}

type counts struct {
	CT   countEntry `json:"ct"`
	Host countEntry `json:"host"`
	VM   countEntry `json:"vm"`
}

type statusResponse struct {
	Total    uint64   `json:"total"`
	Used     uint64   `json:"used"`
	Avail    uint64   `json:"avail"`
	GCStatus gcStatus `json:"gc-status"`
	Counts   counts   `json:"counts"`
}

// ServeHTTP returns disk usage and lightweight metadata for the datastore.
//
// Path:    /api2/json/admin/datastore/<store>/status
// Method:  GET
// Auth:    enforced by requireAuth wrapper at registration.
//
// total/used/avail come from statfs() on the datastore's root path.
// gc-status and counts are populated with placeholder defaults — adequate
// for PVE's storage-health indicator. A future PR can populate counts
// from the snapshot index when that work lands.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Path format: /api2/json/admin/datastore/<store>/status
	const prefix = "/api2/json/admin/datastore/"
	rest := strings.TrimPrefix(r.URL.Path, prefix)
	if !strings.HasSuffix(rest, "/status") {
		http.NotFound(w, r)
		return
	}
	store := strings.TrimSuffix(rest, "/status")
	if store == "" || strings.Contains(store, "/") {
		http.NotFound(w, r)
		return
	}

	ds, err := h.datastores.ByName(store)
	if errors.Is(err, datastore.ErrNotFound) || errors.Is(err, datastore.ErrInvalidName) {
		http.Error(w, "datastore not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "datastore lookup failed", http.StatusInternalServerError)
		return
	}

	var stat syscall.Statfs_t
	if err := syscall.Statfs(ds.Path, &stat); err != nil {
		http.Error(w, "statfs failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	bsize := uint64(stat.Bsize)
	resp := statusResponse{
		Total: stat.Blocks * bsize,
		Used:  (stat.Blocks - stat.Bfree) * bsize,
		Avail: stat.Bavail * bsize,
		GCStatus: gcStatus{
			UPID:           "",
			LastRunEndtime: 0,
			LastRunState:   "",
		},
		Counts: counts{},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": resp})
}
