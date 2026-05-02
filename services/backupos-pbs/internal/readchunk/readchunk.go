// Package readchunk implements GET /chunk for the reader protocol.
//
// Wire format (matches PBS reference src/api2/reader/mod.rs:download_chunk):
//
//	GET /chunk?digest=<64 hex chars>
//	→
//	200 application/octet-stream <chunk DataBlob bytes>   if digest is allowed
//	401 if digest not in session's allowed_chunks set
//	404 if chunk file is missing on disk
package readchunk

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// Handler serves GET /chunk requests.
type Handler struct{}

// NewHandler constructs a readchunk Handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP handles GET /chunk?digest=<hex>.
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

	digestHex := r.URL.Query().Get("digest")
	if len(digestHex) != 64 {
		writeJSONError(w, http.StatusBadRequest, `"digest" must be 64 hex characters`)
		return
	}
	digestBytes, err := hex.DecodeString(digestHex)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "digest is not valid hex")
		return
	}
	var digest [32]byte
	copy(digest[:], digestBytes)

	// Auth check first — matches PBS reference check_chunk_access ordering.
	if !sc.ReaderState.CheckChunkAccess(digest) {
		slog.Info("chunk download denied",
			"session_id", sc.SessionID,
			"digest", digestHex,
		)
		writeJSONError(w, http.StatusUnauthorized,
			fmt.Sprintf("download chunk %s not allowed", digestHex))
		return
	}

	// Chunk path: <datastore_root>/.chunks/<first4hex>/<fullhex>
	chunkPath := filepath.Join(sc.DatastoreRoot, ".chunks", digestHex[:4], digestHex)

	st, err := os.Stat(chunkPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, "chunk not found on disk")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "stat failed")
		return
	}
	if !st.Mode().IsRegular() {
		writeJSONError(w, http.StatusInternalServerError, "chunk path is not a regular file")
		return
	}

	f, err := os.Open(chunkPath)
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
		slog.Warn("chunk stream failed",
			"session_id", sc.SessionID,
			"digest", digestHex,
			"bytes_sent", n,
			"error", err,
		)
		return
	}

	slog.Info("chunk served",
		"session_id", sc.SessionID,
		"digest", digestHex,
		"size", st.Size(),
	)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
