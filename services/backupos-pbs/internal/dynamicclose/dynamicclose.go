// Package dynamicclose implements the POST /dynamic_close H2 endpoint.
//
// The client calls POST /dynamic_close after all chunks have been uploaded and
// associated via PUT /dynamic_index. Unlike POST /fixed_close, no "size"
// parameter is expected — the total size of a dynamic archive is not known
// upfront. The server validates chunk-count and index checksum only.
package dynamicclose

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// Handler implements POST /dynamic_close.
type Handler struct{}

// NewHandler constructs a dynamicclose handler.
func NewHandler() *Handler { return &Handler{} }

// ServeHTTP routes POST /dynamic_close → finalise; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("dynamicclose handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	wid, chunkCount, size, csum, err := parseQuery(r.URL.Query())
	if err != nil {
		slog.Info("dynamic_close rejected: bad params", "reason", err.Error(), "session_id", sc.SessionID)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, err = sc.WriterState.DynamicWriterClose(wid, chunkCount, size, csum)
	if err != nil {
		slog.Info("dynamic_close failed",
			"reason", err.Error(), "session_id", sc.SessionID, "wid", wid)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	slog.Info("dynamic_close finalised",
		"session_id", sc.SessionID,
		"wid", wid,
		"chunk_count", chunkCount,
		"size", size,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

// parseQuery validates and extracts query parameters.
func parseQuery(q map[string][]string) (wid int, chunkCount uint64, size uint64, csum [32]byte, err error) {
	get := func(k string) string {
		if v := q[k]; len(v) > 0 {
			return v[0]
		}
		return ""
	}

	widRaw := get("wid")
	if widRaw == "" {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("missing required parameter \"wid\"")
	}
	widI, e := strconv.Atoi(widRaw)
	if e != nil || widI < 1 || widI > 256 {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("invalid \"wid\": must be 1..256")
	}

	ccRaw := get("chunk-count")
	if ccRaw == "" {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("missing required parameter \"chunk-count\"")
	}
	ccI, e := strconv.ParseUint(ccRaw, 10, 64)
	if e != nil {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("invalid \"chunk-count\"")
	}

	sizeRaw := get("size")
	if sizeRaw == "" {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("missing required parameter \"size\"")
	}
	sizeI, e := strconv.ParseUint(sizeRaw, 10, 64)
	if e != nil {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("invalid \"size\"")
	}

	csumHex := get("csum")
	if len(csumHex) != 64 {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("invalid \"csum\": must be 64 hex chars")
	}
	csumBytes, e := hex.DecodeString(csumHex)
	if e != nil {
		return 0, 0, 0, [32]byte{}, fmt.Errorf("invalid \"csum\": not valid hex")
	}
	var c [32]byte
	copy(c[:], csumBytes)

	return widI, ccI, sizeI, c, nil
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
