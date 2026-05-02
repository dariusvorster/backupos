package upgrade

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"golang.org/x/net/http2"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

// UpgradeToken is the custom Upgrade header value PVE sends for backup
// and reader endpoints. NOT h2c — PBS uses its own token.
const UpgradeToken = "proxmox-backup-protocol-v1"

// Handler handles a PBS upgrade request:
//
//  1. Validate the Upgrade headers (Connection: Upgrade, Upgrade: proxmox-backup-protocol-v1)
//  2. Parse and validate the query parameters
//  3. Look up the datastore by name
//  4. Hijack the underlying TCP connection
//  5. Write 101 Switching Protocols
//  6. Hand the connection to http2.Server.ServeConn
//  7. The H2 server dispatches streams to streamHandler (501 stubs in this PR)
//
// Auth must already have passed before this handler is called — the caller
// is expected to wrap this with the requireAuth middleware.
type Handler struct {
	datastores    *datastore.Lookup
	streamHandler http.Handler
}

// NewHandler constructs a new upgrade Handler.
//
// streamHandler is the http.Handler invoked for each HTTP/2 stream after the
// upgrade succeeds. In M4b-go-upgrade this is a 501-stub; M4c-go-* PRs replace
// it with real backup endpoint handlers.
func NewHandler(datastores *datastore.Lookup, streamHandler http.Handler) *Handler {
	return &Handler{
		datastores:    datastores,
		streamHandler: streamHandler,
	}
}

// ServeHTTP implements http.Handler. The auth middleware is expected to
// have already gated this; we don't re-check Authorization here.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Step 1: Validate Upgrade headers.
	if !hasUpgradeHeaders(r) {
		// Fallback to 501 — caller used /backup or /reader without upgrade.
		// This matches the existing M4b-go-auth stub behavior.
		writeStub501(w, identifyKind(r.URL.Path))
		return
	}

	// Step 2: Parse query params.
	params, err := ParseParams(r.URL)
	if err != nil {
		writeUpgradeError(w, http.StatusBadRequest, err.Error())
		slog.Info("upgrade rejected: invalid params",
			"reason", err.Error(),
			"path", r.URL.Path,
			"remote", r.RemoteAddr,
		)
		return
	}

	// Step 3: Datastore lookup.
	ds, err := h.datastores.ByName(params.Store)
	if errors.Is(err, datastore.ErrNotFound) {
		writeUpgradeError(w, http.StatusNotFound, fmt.Sprintf("datastore %q not found", params.Store))
		slog.Info("upgrade rejected: datastore not found",
			"store", params.Store,
			"remote", r.RemoteAddr,
		)
		return
	}
	if errors.Is(err, datastore.ErrInvalidName) {
		// Should be caught by ParseParams; defensive.
		writeUpgradeError(w, http.StatusBadRequest, "invalid datastore name")
		return
	}
	if err != nil {
		slog.Error("datastore lookup failed", "error", err, "store", params.Store)
		writeUpgradeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Step 4: Hijack the connection.
	hj, ok := w.(http.Hijacker)
	if !ok {
		// Should never happen with the standard http.Server, but the
		// type system requires us to check.
		slog.Error("ResponseWriter does not support hijacking")
		writeUpgradeError(w, http.StatusInternalServerError, "hijack not supported")
		return
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		slog.Error("hijack failed", "error", err)
		return
	}
	// After Hijack, we own conn. ServeConn (below) blocks until the connection
	// ends and closes it for us on the success path.

	slog.Info("upgrade accepted",
		"path", r.URL.Path,
		"store", params.Store,
		"datastore_id", ds.ID,
		"backup_type", params.BackupType,
		"backup_id", params.BackupID,
		"backup_time", params.BackupTime,
		"namespace", params.Namespace,
		"remote", r.RemoteAddr,
	)

	// Step 5: Write the 101 response.
	if err := writeSwitchingProtocols(brw); err != nil {
		slog.Error("failed to write 101", "error", err)
		_ = conn.Close()
		return
	}

	// Step 6: Hand off to http2.Server.
	//
	// We construct a per-connection http2.Server. This matches the
	// pmoxs3backuproxy reference architecture and gives us a clean place
	// to attach per-session state in subsequent PRs.
	h2srv := &http2.Server{}

	h2srv.ServeConn(conn, &http2.ServeConnOpts{
		Handler: h.streamHandler,
		// We intentionally do NOT set UpgradeRequest — that's specifically
		// for h2c upgrades where the original HTTP/1.1 request becomes the
		// first H2 stream. PBS doesn't work that way; the upgrade response
		// is ack-only and the client opens new streams.
		// SawClientPreface stays false — the client preface arrives after
		// our 101 over the same connection, which is what http2.Server
		// expects as its default state.
	})

	slog.Info("upgrade connection closed",
		"path", r.URL.Path,
		"datastore_id", ds.ID,
	)
}

// hasUpgradeHeaders reports whether the request has the expected
// Connection: Upgrade and Upgrade: proxmox-backup-protocol-v1 headers.
func hasUpgradeHeaders(r *http.Request) bool {
	connFound := false
	for _, c := range r.Header.Values("Connection") {
		for _, part := range strings.Split(c, ",") {
			if strings.EqualFold(strings.TrimSpace(part), "Upgrade") {
				connFound = true
				break
			}
		}
		if connFound {
			break
		}
	}
	if !connFound {
		return false
	}
	return strings.EqualFold(r.Header.Get("Upgrade"), UpgradeToken)
}

// writeSwitchingProtocols writes the 101 response on the hijacked connection.
func writeSwitchingProtocols(brw *bufio.ReadWriter) error {
	const resp = "HTTP/1.1 101 Switching Protocols\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + UpgradeToken + "\r\n" +
		"\r\n"
	if _, err := brw.WriteString(resp); err != nil {
		return fmt.Errorf("write 101: %w", err)
	}
	if err := brw.Flush(); err != nil {
		return fmt.Errorf("flush 101: %w", err)
	}
	return nil
}

// writeUpgradeError writes a JSON error response before hijacking.
func writeUpgradeError(w http.ResponseWriter, status int, reason string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": reason})
}

// identifyKind returns "backup" or "reader" for stub error messages.
func identifyKind(path string) string {
	if strings.HasPrefix(path, "/api2/json/reader") {
		return "reader"
	}
	return "backup"
}

// writeStub501 mirrors the existing main.go stub501 for the no-upgrade-headers fallback.
func writeStub501(w http.ResponseWriter, kind string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "PBS protocol " + kind + " endpoint pending — handler lands in M4c-go",
	})
}
