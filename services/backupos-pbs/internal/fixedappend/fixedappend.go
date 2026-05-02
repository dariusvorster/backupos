// Package fixedappend implements the PUT /fixed_index H2 endpoint.
//
// The client sends a batch of (digest, offset) pairs to associate with an open
// .fidx writer. Each digest must already be in the session's known_chunks map
// (populated by POST /fixed_chunk). This is the critical check that prevents
// associating unuploaded chunks.
package fixedappend

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// appendRequest is the JSON body for PUT /fixed_index.
type appendRequest struct {
	Wid        int      `json:"wid"`
	DigestList []string `json:"digest-list"`
	OffsetList []uint64 `json:"offset-list"`
}

// Handler implements PUT /fixed_index.
type Handler struct{}

// NewHandler constructs a fixedappend handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP routes PUT /fixed_index → batch append; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.Header().Set("Allow", http.MethodPut)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("fixedappend handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req appendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid JSON body: %s", err.Error()))
		return
	}

	if req.Wid < 1 || req.Wid > 256 {
		writeError(w, http.StatusBadRequest, "invalid \"wid\": must be 1..256")
		return
	}
	if len(req.DigestList) != len(req.OffsetList) {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("digest-list length %d != offset-list length %d",
				len(req.DigestList), len(req.OffsetList)))
		return
	}

	for i, digestHex := range req.DigestList {
		offset := req.OffsetList[i]

		if len(digestHex) != 64 {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("digest-list[%d]: must be 64 hex chars", i))
			return
		}
		digestBytes, err := hex.DecodeString(digestHex)
		if err != nil {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("digest-list[%d]: invalid hex", i))
			return
		}
		var digest [32]byte
		copy(digest[:], digestBytes)

		size, ok := sc.WriterState.LookupChunk(digest)
		if !ok {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("digest-list[%d]: chunk %s not uploaded in this session", i, digestHex[:16]+"..."))
			return
		}

		if err := sc.WriterState.FixedWriterAppendChunk(req.Wid, offset, size, digest); err != nil {
			slog.Info("fixedappend chunk append failed",
				"reason", err.Error(), "session_id", sc.SessionID, "index", i)
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	slog.Info("fixed_index appended",
		"session_id", sc.SessionID,
		"wid", req.Wid,
		"count", len(req.DigestList),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
