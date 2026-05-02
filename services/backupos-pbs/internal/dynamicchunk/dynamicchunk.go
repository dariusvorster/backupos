// Package dynamicchunk implements the POST /dynamic_chunk H2 endpoint.
//
// Identical protocol to POST /fixed_chunk, but registers the chunk with a
// dynamic writer (no chunk-size constraint). The client uploads each chunk
// DataBlob here before associating it via PUT /dynamic_index.
package dynamicchunk

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/chunkstore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datablob"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

const (
	maxChunkPlaintext = 16 * 1024 * 1024
	maxBlobEncoded    = maxChunkPlaintext + 44
	minBlobEncoded    = 13
)

// Handler implements POST /dynamic_chunk.
type Handler struct{}

// NewHandler constructs a dynamicchunk handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP routes POST /dynamic_chunk → upload; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("dynamicchunk handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	wid, digest, plainSize, encodedSize, err := parseQuery(r.URL.Query())
	if err != nil {
		slog.Info("dynamic_chunk rejected: bad params", "reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	limited := io.LimitReader(r.Body, int64(encodedSize)+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		slog.Error("dynamic_chunk body read failed", "error", err, "session_id", sc.SessionID)
		writeError(w, http.StatusInternalServerError, "read failed")
		return
	}
	if int64(len(raw)) != int64(encodedSize) {
		slog.Info("dynamic_chunk rejected: body size mismatch",
			"want", encodedSize, "got", len(raw), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("body length %d does not match encoded-size %d", len(raw), encodedSize))
		return
	}

	blob, err := datablob.Parse(raw)
	if err != nil {
		slog.Info("dynamic_chunk rejected: bad DataBlob", "reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid DataBlob: %s", err.Error()))
		return
	}

	if err := blob.VerifyUnencrypted(plainSize, digest); err != nil {
		slog.Info("dynamic_chunk rejected: verification failed",
			"reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, fmt.Sprintf("chunk verification failed: %s", err.Error()))
		return
	}

	cs, err := chunkstore.New(sc.DatastoreRoot)
	if err != nil {
		slog.Error("chunk store init failed",
			"error", err, "session_id", sc.SessionID, "datastore_root", sc.DatastoreRoot)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	isDuplicate, _, err := cs.Insert(digest, raw)
	if err != nil {
		slog.Error("chunk insert failed", "error", err, "session_id", sc.SessionID)
		writeError(w, http.StatusInternalServerError, "chunk write failed")
		return
	}

	if err := sc.WriterState.RegisterDynamicChunk(wid, digest, plainSize, isDuplicate); err != nil {
		slog.Info("dynamic_chunk rejected: register failed",
			"reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	slog.Info("dynamic_chunk uploaded",
		"session_id", sc.SessionID,
		"wid", wid,
		"digest", hex.EncodeToString(digest[:]),
		"size", plainSize,
		"duplicate", isDuplicate,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"data": hex.EncodeToString(digest[:])})
}

// parseQuery validates and extracts query parameters.
func parseQuery(q map[string][]string) (wid int, digest [32]byte, plainSize uint32, encodedSize int64, err error) {
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return v[0]
		}
		return ""
	}

	widRaw := get("wid")
	if widRaw == "" {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("missing required parameter \"wid\"")
	}
	widI, e := strconv.Atoi(widRaw)
	if e != nil || widI < 1 || widI > 256 {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("invalid \"wid\": must be 1..256")
	}

	digestHex := get("digest")
	if len(digestHex) != 64 {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("invalid \"digest\": must be 64 hex chars")
	}
	digestBytes, e := hex.DecodeString(digestHex)
	if e != nil {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("invalid \"digest\": not valid hex")
	}
	var d [32]byte
	copy(d[:], digestBytes)

	sizeRaw := get("size")
	if sizeRaw == "" {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("missing required parameter \"size\"")
	}
	sizeI, e := strconv.ParseInt(sizeRaw, 10, 64)
	if e != nil || sizeI < 1 || sizeI > maxChunkPlaintext {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("invalid \"size\": must be 1..%d", maxChunkPlaintext)
	}

	encSizeRaw := get("encoded-size")
	if encSizeRaw == "" {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("missing required parameter \"encoded-size\"")
	}
	encSizeI, e := strconv.ParseInt(encSizeRaw, 10, 64)
	if e != nil || encSizeI < minBlobEncoded || encSizeI > maxBlobEncoded {
		return 0, [32]byte{}, 0, 0, fmt.Errorf("invalid \"encoded-size\": must be %d..%d", minBlobEncoded, maxBlobEncoded)
	}

	return widI, d, uint32(sizeI), encSizeI, nil
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
