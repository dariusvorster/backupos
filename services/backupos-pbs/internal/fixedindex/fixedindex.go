// Package fixedindex implements the POST /fixed_index H2 endpoint.
//
// The client calls POST /fixed_index once per .fidx file it wants to create.
// The server creates the .fidx writer, registers it in the session WriterState,
// and returns the writer ID (wid) for use in subsequent PUT /fixed_index and
// POST /fixed_close calls.
package fixedindex

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// chunkSize is hardcoded to 4 MiB per the PBS reference implementation.
// It is NOT exposed as a query parameter.
const chunkSize = 4 * 1024 * 1024

// archiveNameRegex matches valid .fidx archive names.
var archiveNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.fidx$`)

// Handler implements POST /fixed_index.
type Handler struct{}

// NewHandler constructs a fixedindex handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP routes POST /fixed_index → create writer; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("fixedindex handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	archiveName, size, err := parseQuery(r.URL.Query())
	if err != nil {
		slog.Info("fixed_index rejected", "reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	snapDir, err := snapshot.EnsureDir(sc.DatastoreRoot, sc.BackupType, sc.BackupID, sc.BackupTime)
	if err != nil {
		slog.Error("snapshot dir ensure failed",
			"error", err, "session_id", sc.SessionID, "datastore_root", sc.DatastoreRoot)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	finalPath := snapDir + "/" + archiveName
	fw, err := fidx.Create(finalPath, size, chunkSize)
	if err != nil {
		slog.Error("fidx create failed",
			"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	sizeVal := size
	wid, err := sc.WriterState.RegisterFixedWriter(archiveName, fw, &sizeVal, chunkSize, false)
	if err != nil {
		fw.Drop()
		slog.Error("register fixed writer failed",
			"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	slog.Info("fixed_index created",
		"session_id", sc.SessionID,
		"archive_name", archiveName,
		"size", size,
		"wid", wid,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]int{"data": wid})
}

// parseQuery validates and extracts query parameters.
func parseQuery(q map[string][]string) (archiveName string, size uint64, err error) {
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return v[0]
		}
		return ""
	}

	if get("reuse-csum") != "" {
		return "", 0, fmt.Errorf("incremental backups (reuse-csum) not supported in V1")
	}

	archiveName = get("archive-name")
	if archiveName == "" {
		return "", 0, fmt.Errorf("missing required parameter \"archive-name\"")
	}
	if len(archiveName) > 64 {
		return "", 0, fmt.Errorf("\"archive-name\" too long (max 64 chars)")
	}
	if !archiveNameRegex.MatchString(archiveName) {
		return "", 0, fmt.Errorf("invalid \"archive-name\": must match [A-Za-z0-9_.-]+\\.fidx")
	}

	sizeRaw := get("size")
	if sizeRaw == "" {
		return "", 0, fmt.Errorf("missing required parameter \"size\" (growable .fidx not supported in V1)")
	}
	sizeI, err2 := strconv.ParseUint(sizeRaw, 10, 64)
	if err2 != nil || sizeI == 0 {
		return "", 0, fmt.Errorf("invalid \"size\": must be a positive integer")
	}
	return archiveName, sizeI, nil
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
