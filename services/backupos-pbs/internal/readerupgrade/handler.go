// Package readerupgrade implements the HTTP/1.1 → HTTP/2 upgrade handshake
// for proxmox-backup-reader-protocol-v1.
//
// Key differences from internal/upgrade (backup side):
//   - Different upgrade token: proxmox-backup-reader-protocol-v1
//   - Snapshot must already exist (snapshot.ResolveDir, not EnsureDir)
//   - Acquires shared lock (LOCK_SH) — multiple concurrent readers coexist
//   - Reader sessions are NOT persisted to pbs_active_sessions
//
// Auth is performed inline (not via requireAuth middleware), so this handler
// must be registered on the mux directly, not wrapped.
package readerupgrade

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/http2"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/owner"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/rstate"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snaplock"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

const (
	// ReaderProtocolID is the Upgrade token for reader sessions.
	// Distinct from the backup token (proxmox-backup-protocol-v1).
	ReaderProtocolID = "proxmox-backup-reader-protocol-v1"

	h2MaxFrameSize = 4 * 1024 * 1024
)

// Handler handles a PBS reader-protocol upgrade request.
type Handler struct {
	validator       *auth.Validator
	datastores      *datastore.Lookup
	downloadHandler http.Handler
	chunkHandler    http.Handler
}

// NewHandler constructs a reader upgrade Handler.
// validator is used for inline auth (no requireAuth middleware needed).
// downloadHandler serves GET /download; chunkHandler serves GET /chunk.
func NewHandler(
	validator *auth.Validator,
	datastores *datastore.Lookup,
	downloadHandler http.Handler,
	chunkHandler http.Handler,
) *Handler {
	return &Handler{
		validator:       validator,
		datastores:      datastores,
		downloadHandler: downloadHandler,
		chunkHandler:    chunkHandler,
	}
}

// ServeHTTP handles the reader upgrade request.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Step 1: Method check.
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// Step 2: Authenticate inline.
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		writeJSONError(w, http.StatusUnauthorized, "missing Authorization header")
		return
	}
	parsed, err := auth.ParseAuthHeader(authHeader)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "malformed Authorization header")
		return
	}
	identity, err := h.validator.Validate(parsed)
	if err != nil {
		slog.Info("reader auth failed",
			"reason", err.Error(),
			"user", parsed.User,
			"realm", parsed.Realm,
			"token_name", parsed.TokenName,
			"remote", r.RemoteAddr,
		)
		writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Step 3: Verify Upgrade headers.
	if !hasReaderUpgradeHeaders(r) {
		writeJSONError(w, http.StatusBadRequest,
			fmt.Sprintf("missing or invalid upgrade headers; expected Upgrade: %s", ReaderProtocolID))
		return
	}

	// Step 4: Parse query parameters.
	q := r.URL.Query()

	if ns := q.Get("ns"); ns != "" {
		writeJSONError(w, http.StatusBadRequest, "namespaces not supported in V1")
		return
	}

	storeName := q.Get("store")
	if storeName == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "store"`)
		return
	}
	backupType := q.Get("backup-type")
	if backupType == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "backup-type"`)
		return
	}
	if !validBackupType(backupType) {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid backup-type: %q", backupType))
		return
	}
	backupID := q.Get("backup-id")
	if backupID == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "backup-id"`)
		return
	}
	backupTimeStr := q.Get("backup-time")
	if backupTimeStr == "" {
		writeJSONError(w, http.StatusBadRequest, `missing required parameter "backup-time"`)
		return
	}
	backupTime, err := parseBackupTime(backupTimeStr)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Step 5: Datastore lookup.
	ds, err := h.datastores.ByName(storeName)
	if errors.Is(err, datastore.ErrNotFound) || errors.Is(err, datastore.ErrInvalidName) {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("unknown datastore %q", storeName))
		return
	}
	if err != nil {
		slog.Error("datastore lookup failed", "error", err, "store", storeName)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// AuthorizeDatastore: token must be unrestricted or scoped to this datastore.
	if err := auth.AuthorizeDatastore(identity, ds.ID); err != nil {
		writeJSONError(w, http.StatusForbidden, "token not authorized for this datastore")
		return
	}

	// Owner check: requesting user must own the backup group (or no owner file exists — V1 backcompat).
	userRealm := identity.User + "@" + identity.Realm
	if err := owner.Check(ds.Path, backupType, backupID, userRealm); err != nil {
		if errors.Is(err, owner.ErrOwnerMismatch) {
			slog.Info("reader rejected: backup group owner mismatch",
				"user", userRealm,
				"datastore_id", ds.ID,
				"backup_type", backupType,
				"backup_id", backupID,
				"remote", r.RemoteAddr,
			)
			writeJSONError(w, http.StatusForbidden, "backup group owned by a different user")
			return
		}
		slog.Error("owner check failed", "error", err, "datastore_id", ds.ID)
		writeJSONError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Step 6: Resolve snapshot (must exist) and acquire shared lock.
	snapDir, err := snapshot.ResolveDir(ds.Path, backupType, backupID, backupTime)
	if err != nil {
		slog.Info("reader rejected: snapshot not found",
			"store", storeName, "backup_type", backupType,
			"backup_id", backupID, "backup_time", backupTime.Format(time.RFC3339),
		)
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	lock, err := snaplock.AcquireShared(snapDir)
	if err != nil {
		if errors.Is(err, snaplock.ErrLockBusy) {
			writeJSONError(w, http.StatusConflict, "snapshot is exclusively locked by another session")
			return
		}
		slog.Error("reader snaplock failed", "error", err, "snap_dir", snapDir)
		writeJSONError(w, http.StatusInternalServerError, "snapshot lock failed")
		return
	}

	// Step 7: Mint session ID for logging (no DB row).
	sessionID := mintSessionID(identity.TokenID, storeName, backupType, backupID, backupTime)

	slog.Info("reader upgrade accepted",
		"session_id", sessionID,
		"store", storeName,
		"datastore_id", ds.ID,
		"backup_type", backupType,
		"backup_id", backupID,
		"backup_time", backupTime.Format(time.RFC3339),
		"remote", r.RemoteAddr,
	)

	// Step 8: Hijack the connection.
	hj, ok := w.(http.Hijacker)
	if !ok {
		_ = lock.Release()
		writeJSONError(w, http.StatusInternalServerError, "hijack not supported")
		return
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		_ = lock.Release()
		slog.Error("reader hijack failed", "error", err, "session_id", sessionID)
		return
	}

	// Step 9: Write 101 Switching Protocols.
	if err := writeSwitchingProtocols(brw); err != nil {
		_ = conn.Close()
		_ = lock.Release()
		slog.Error("reader write 101 failed", "error", err, "session_id", sessionID)
		return
	}

	// Step 10: Build session context and drive H2.
	rs := rstate.New()
	sc := &streamctx.SessionContext{
		SessionID:     sessionID,
		DatastoreID:   ds.ID,
		DatastoreRoot: ds.Path,
		BackupType:    backupType,
		BackupID:      backupID,
		BackupTime:    backupTime,
		ReaderState:   rs,
	}

	router := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := streamctx.WithSession(r.Context(), sc)
		r = r.WithContext(ctx)
		switch r.URL.Path {
		case "/download":
			h.downloadHandler.ServeHTTP(w, r)
		case "/chunk":
			h.chunkHandler.ServeHTTP(w, r)
		case "/speedtest":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotImplemented)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "speedtest not implemented in V1"})
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		}
	})

	h2srv := &http2.Server{
		MaxReadFrameSize: h2MaxFrameSize,
	}
	h2srv.ServeConn(conn, &http2.ServeConnOpts{
		Handler: router,
	})

	// Connection closed. Release the shared lock.
	if err := lock.Release(); err != nil {
		slog.Warn("reader lock release failed", "error", err, "session_id", sessionID)
	}
	slog.Info("reader connection closed",
		"session_id", sessionID,
		"datastore_id", ds.ID,
	)
}

// hasReaderUpgradeHeaders checks for Connection: Upgrade and
// Upgrade: proxmox-backup-reader-protocol-v1.
func hasReaderUpgradeHeaders(r *http.Request) bool {
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
	return strings.EqualFold(r.Header.Get("Upgrade"), ReaderProtocolID)
}

// writeSwitchingProtocols writes the 101 response on the hijacked connection.
func writeSwitchingProtocols(brw *bufio.ReadWriter) error {
	const resp = "HTTP/1.1 101 Switching Protocols\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + ReaderProtocolID + "\r\n" +
		"\r\n"
	if _, err := brw.WriteString(resp); err != nil {
		return fmt.Errorf("write 101: %w", err)
	}
	if err := brw.Flush(); err != nil {
		return fmt.Errorf("flush 101: %w", err)
	}
	return nil
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func validBackupType(t string) bool {
	return t == "vm" || t == "ct" || t == "host"
}

// parseBackupTime parses a backup-time query parameter (Unix seconds integer).
func parseBackupTime(s string) (time.Time, error) {
	var sec int64
	if _, err := fmt.Sscanf(s, "%d", &sec); err != nil {
		return time.Time{}, fmt.Errorf("invalid backup-time: %q", s)
	}
	return time.Unix(sec, 0).UTC(), nil
}

// mintSessionID returns a short unique ID for logging reader sessions.
// Reader sessions are not persisted to the DB; this is for log correlation only.
func mintSessionID(tokenID, store, backupType, backupID string, t time.Time) string {
	h := sha256.New()
	h.Write([]byte(tokenID))
	h.Write([]byte{0})
	h.Write([]byte(store))
	h.Write([]byte{0})
	h.Write([]byte(backupType))
	h.Write([]byte{0})
	h.Write([]byte(backupID))
	h.Write([]byte{0})
	fmt.Fprintf(h, "%d-%d", t.Unix(), time.Now().UnixNano())
	sum := h.Sum(nil)
	return hex.EncodeToString(sum[:8]) + "-reader"
}
