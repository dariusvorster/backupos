// Package download implements GET /download for the reader protocol.
//
// Wire format (matches PBS reference src/api2/reader/mod.rs:download_file):
//
//	GET /download?file-name=<archive-name>
//	→
//	Content-Type: application/octet-stream
//	Content-Length: <file size>
//	<raw file contents>
//
// For .fidx and .didx files, the handler ALSO parses the index body and
// registers every chunk digest in the session's allowed_chunks set,
// gating subsequent GET /chunk requests.
package download

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/indexread"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

const maxFileNameLen = 64

// Handler serves GET /download requests.
type Handler struct{}

// NewHandler constructs a download Handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP handles GET /download?file-name=<name>.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil || sc.ReaderState == nil {
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	fileName := r.URL.Query().Get("file-name")
	if fileName == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "file-name"`)
		return
	}
	if !validFileName(fileName) {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid file-name: %q", fileName))
		return
	}

	snapDir := filepath.Join(
		sc.Namespace.JoinPath(sc.DatastoreRoot),
		sc.BackupType,
		sc.BackupID,
		sc.BackupTime.UTC().Format("2006-01-02T15:04:05Z"),
	)
	filePath := filepath.Join(snapDir, fileName)

	// Defense-in-depth: reject any path that escapes the snapshot directory,
	// even if validFileName somehow passed a crafted name.
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(snapDir)+string(filepath.Separator)) {
		writeJSONError(w, http.StatusBadRequest, "file-name escapes snapshot directory")
		return
	}

	st, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, fmt.Sprintf("file not found: %s", fileName))
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "stat failed")
		return
	}
	if !st.Mode().IsRegular() {
		writeJSONError(w, http.StatusBadRequest, "not a regular file")
		return
	}

	// For index files: register all chunk digests BEFORE streaming.
	registered := 0
	if strings.HasSuffix(fileName, ".fidx") || strings.HasSuffix(fileName, ".didx") {
		digests, err := indexread.EnumerateDigests(filePath)
		if err != nil {
			slog.Warn("download: index parse failed",
				"session_id", sc.SessionID,
				"file_name", fileName,
				"error", err,
			)
			writeJSONError(w, http.StatusInternalServerError, "index parse failed")
			return
		}
		for _, d := range digests {
			sc.ReaderState.RegisterChunk(d)
		}
		registered = len(digests)
	}

	// Open separately from the parse step so we don't hold two fds at once.
	f, err := os.Open(filePath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "open failed")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", st.Size()))
	w.WriteHeader(http.StatusOK)

	n, err := io.Copy(w, f)
	if err != nil {
		slog.Warn("download: stream failed",
			"session_id", sc.SessionID,
			"file_name", fileName,
			"bytes_sent", n,
			"error", err,
		)
		return
	}

	slog.Info("download served",
		"session_id", sc.SessionID,
		"file_name", fileName,
		"size", st.Size(),
		"chunks_registered", registered,
	)
}

// validFileName accepts only safe characters — no slashes, no dots sequences,
// no control chars. File-name must be non-empty and ≤ maxFileNameLen.
func validFileName(name string) bool {
	if len(name) == 0 || len(name) > maxFileNameLen {
		return false
	}
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '.' || r == '-' || r == '_':
		default:
			return false
		}
	}
	return true
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
