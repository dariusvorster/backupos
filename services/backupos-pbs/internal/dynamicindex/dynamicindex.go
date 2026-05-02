// Package dynamicindex implements the POST /dynamic_index H2 endpoint.
//
// The client calls POST /dynamic_index once per .didx file it wants to create.
// Unlike POST /fixed_index, no "size" parameter is accepted — dynamic index
// size is unknown upfront. The server creates the .didx writer, registers it
// in the session WriterState, and returns the writer ID (wid).
package dynamicindex

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// archiveNameRegex matches valid .didx archive names.
var archiveNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.didx$`)

// Handler implements POST /dynamic_index.
type Handler struct{}

// NewHandler constructs a dynamicindex handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP routes POST /dynamic_index → create writer; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("dynamicindex handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	archiveName, err := parseQuery(r.URL.Query())
	if err != nil {
		slog.Info("dynamic_index rejected", "reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	snapDir, err := snapshot.EnsureDir(sc.DatastoreRoot, sc.Namespace, sc.BackupType, sc.BackupID, sc.BackupTime)
	if err != nil {
		slog.Error("snapshot dir ensure failed",
			"error", err, "session_id", sc.SessionID, "datastore_root", sc.DatastoreRoot)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	finalPath := snapDir + "/" + archiveName
	dw, err := didx.Create(finalPath)
	if err != nil {
		slog.Error("didx create failed",
			"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	wid, err := sc.WriterState.RegisterDynamicWriter(archiveName, dw)
	if err != nil {
		dw.Drop()
		slog.Error("register dynamic writer failed",
			"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	slog.Info("dynamic_index created",
		"session_id", sc.SessionID,
		"archive_name", archiveName,
		"wid", wid,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]int{"data": wid})
}

// parseQuery validates and extracts the archive-name query parameter.
func parseQuery(q map[string][]string) (archiveName string, err error) {
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return v[0]
		}
		return ""
	}

	archiveName = get("archive-name")
	if archiveName == "" {
		return "", fmt.Errorf("missing required parameter \"archive-name\"")
	}
	if len(archiveName) > 64 {
		return "", fmt.Errorf("\"archive-name\" too long (max 64 chars)")
	}
	if !archiveNameRegex.MatchString(archiveName) {
		return "", fmt.Errorf("invalid \"archive-name\": must match [A-Za-z0-9_.-]+\\.didx")
	}
	return archiveName, nil
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
