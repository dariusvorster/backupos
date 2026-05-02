package upgrade

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// StubStreamHandler is a 501-stub for all HTTP/2 streams on an upgraded
// connection. After M4b-go-upgrade ships, real PVE clients can complete
// the upgrade handshake; their H2 streams then hit this handler and
// receive 501 responses.
//
// M4c-go-blob, M4c-go-fixed-index, M4c-go-dynamic-index, M4c-go-chunk-upload,
// M4c-go-finish replace this with real handlers backed by the chunk store.
func StubStreamHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("h2 stream stubbed",
			"method", r.Method,
			"path", r.URL.Path,
			"remote", r.RemoteAddr,
		)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "endpoint pending — handler lands in M4c-go",
		})
	})
}
