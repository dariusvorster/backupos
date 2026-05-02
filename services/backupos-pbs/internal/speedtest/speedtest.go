// Package speedtest implements the /speedtest endpoint for the
// reader-protocol-v1 H2 stream.
//
// PBS reference: src/api2/reader/mod.rs::speedtest — "Test 1M block download speed"
// Returns exactly 1 MiB of zero bytes with Content-Type: application/octet-stream.
package speedtest

import (
	"log/slog"
	"net/http"
)

// BlockSize is the speedtest payload size — matches PBS reference's 1 MiB.
const BlockSize = 1024 * 1024

// Handler serves a fixed-size block of zeros for connection speed testing.
// Mounted under the reader-protocol-v1 H2 stream alongside /download and /chunk.
//
// The zero buffer is pre-allocated once and shared across all requests (read-only).
func Handler() http.HandlerFunc {
	block := make([]byte, BlockSize)

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", "1048576")
		w.WriteHeader(http.StatusOK)

		n, err := w.Write(block)
		if err != nil {
			slog.Debug("speedtest write failed", "wrote", n, "error", err)
		}
	}
}
