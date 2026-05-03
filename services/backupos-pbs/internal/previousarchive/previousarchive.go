// Package previousarchive implements GET /previous?archive-name=<name>.
//
// The client uses this endpoint to download an archive file from the previous
// backup directory so it can compute its index_csum and pass it back as
// ?reuse-csum= on POST /fixed_index.
package previousarchive

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// archiveNameRegex accepts .fidx, .didx, and .blob archive names.
var archiveNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.(fidx|didx|blob)$`)

// Handler serves GET /previous.
type Handler struct{}

// NewHandler constructs a previousarchive Handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP handles GET /previous?archive-name=<name>.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if sc.PreviousBackup == nil {
		writeJSONError(w, http.StatusNotFound, "no previous successful backup")
		return
	}

	archiveName := r.URL.Query().Get("archive-name")
	if archiveName == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "archive-name"`)
		return
	}
	if !archiveNameRegex.MatchString(archiveName) {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid archive-name: %q", archiveName))
		return
	}

	fullPath := filepath.Join(sc.PreviousBackup.Path, archiveName)
	f, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, fmt.Sprintf("archive %q not in previous backup", archiveName))
			return
		}
		slog.Error("previous archive open failed",
			"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
		writeJSONError(w, http.StatusInternalServerError, "open failed")
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "stat failed")
		return
	}
	if !info.Mode().IsRegular() {
		writeJSONError(w, http.StatusBadRequest, "not a regular file")
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.WriteHeader(http.StatusOK)

	n, err := io.Copy(w, f)
	if err != nil {
		slog.Warn("previous archive stream failed",
			"session_id", sc.SessionID,
			"archive_name", archiveName,
			"bytes_sent", n,
			"error", err,
		)
	}
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
