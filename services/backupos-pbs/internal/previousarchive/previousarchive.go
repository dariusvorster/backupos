// Package previousarchive implements GET /previous?archive-name=<name>.
//
// The client uses this endpoint to download an archive file from the previous
// backup directory so it can compute its index_csum and pass it back as
// ?reuse-csum= on POST /fixed_index.
//
// For .didx archives, the handler also registers every chunk from the previous
// index into the session's known_chunks map before streaming the body. This
// mirrors environment.rs:309 in real PBS: when the client downloads a previous
// .didx it populates its local known_chunks set and will reference those
// digests in /dynamic_index without re-uploading them. Without this
// registration, DynamicWriterAppendChunk returns "chunk not uploaded in this
// session".
package previousarchive

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// archiveNameRegex accepts .fidx, .didx, and .blob archive names.
var archiveNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.(fidx|didx|blob)$`)

// Handler serves GET /previous.
//
// state is an optional fallback used in tests when sc.WriterState is nil.
// In production every backup session carries its own WriterState in the
// session context, so main.go passes nil here.
type Handler struct {
	state *wstate.State
}

// NewHandler constructs a previousarchive Handler.
func NewHandler(state *wstate.State) *Handler {
	return &Handler{state: state}
}

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

	if filepath.Ext(archiveName) == ".didx" {
		// Resolve per-session state: real sessions carry it in the context;
		// tests inject it via the constructor.
		ws := sc.WriterState
		if ws == nil {
			ws = h.state
		}
		if ws != nil {
			if err := h.registerKnownChunks(ws, f, sc.SessionID, archiveName); err != nil {
				slog.Error("previous .didx parse failed for known-chunk registration",
					"error", err,
					"session_id", sc.SessionID,
					"archive_name", archiveName,
				)
				writeJSONError(w, http.StatusInternalServerError,
					"failed to parse previous index for chunk registration")
				return
			}
		}
		// Rewind so the body stream starts at byte 0.
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			slog.Error("previous archive seek failed",
				"error", err, "session_id", sc.SessionID, "archive_name", archiveName)
			writeJSONError(w, http.StatusInternalServerError, "seek failed")
			return
		}
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

// registerKnownChunks parses a .didx file and pre-populates the session's
// known_chunks map with every (digest, size) pair so the client can reuse
// them without re-uploading. Mirrors environment.rs dynamic_writer flow:
// every entry's size is computed from consecutive end-offsets.
func (h *Handler) registerKnownChunks(ws *wstate.State, f *os.File, sessionID, archiveName string) error {
	if _, err := didx.ReadHeader(f); err != nil {
		return fmt.Errorf("read didx header: %w", err)
	}
	entries, err := didx.ReadEntries(f)
	if err != nil {
		return fmt.Errorf("read didx entries: %w", err)
	}
	var prevEnd uint64
	for i, e := range entries {
		size := e.End - prevEnd
		// ReadEntries already enforces MaxChunkSize (64 MiB), so this fits in uint32.
		if size > math.MaxUint32 {
			return fmt.Errorf("didx entry %d size %d exceeds uint32", i, size)
		}
		ws.RegisterKnownChunk(e.Digest, uint32(size))
		prevEnd = e.End
	}
	slog.Info("previous .didx chunks registered for reuse",
		"session_id", sessionID,
		"archive_name", archiveName,
		"count", len(entries),
	)
	return nil
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
