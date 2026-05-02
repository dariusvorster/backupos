// Package handlers implements HTTP handlers for the PBS protocol endpoints.
package handlers

import (
	"encoding/json"
	"net/http"
)

// VersionInfo is the version metadata returned by /api2/json/version.
type VersionInfo struct {
	Version string `json:"version"`
	Release string `json:"release"`
	RepoID  string `json:"repoid"`
}

// VersionHandler serves GET /api2/json/version unauthenticated.
//
// PVE uses this endpoint as a liveness probe before any authentication is
// configured. Real PBS serves this unauthenticated; we match.
type VersionHandler struct {
	info VersionInfo
}

// NewVersionHandler constructs a VersionHandler with the given metadata.
func NewVersionHandler(info VersionInfo) *VersionHandler {
	return &VersionHandler{info: info}
}

// ServeHTTP implements http.Handler.
func (h *VersionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	// PBS wraps responses in {"data": …}. Match the Node implementation.
	resp := map[string]any{"data": h.info}
	_ = json.NewEncoder(w).Encode(resp)
}
