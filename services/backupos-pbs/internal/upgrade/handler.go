package upgrade

import (
	"bufio"
	"database/sql"
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
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/jobsync"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/owner"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// UpgradeToken is the custom Upgrade header value PVE sends for backup
// and reader endpoints. NOT h2c — PBS uses its own token.
const UpgradeToken = "proxmox-backup-protocol-v1"

// Handler handles a PBS upgrade request:
//
//  1. Validate the Upgrade headers (Connection: Upgrade, Upgrade: proxmox-backup-protocol-v1)
//  2. Parse and validate the query parameters
//  3. Look up the datastore by name
//  4. Insert a pbs_active_sessions row (state='backup' or 'reader')
//  5. Hijack the underlying TCP connection
//  6. Write 101 Switching Protocols
//  7. Hand the connection to http2.Server.ServeConn with a per-session router
//  8. Finalize the session row (state='aborted') when the connection closes
//
// Auth must already have passed before this handler is called — the caller
// is expected to wrap this with the requireAuth middleware, which also
// attaches the Identity to the request context via auth.WithIdentity.
type Handler struct {
	datastores          *datastore.Lookup
	sessions            *session.Store
	db                  *sql.DB
	blobHandler         http.Handler
	finishHandler       http.Handler
	fixedIndexHandler   http.Handler
	fixedChunkHandler   http.Handler
	fixedAppendHandler  http.Handler
	fixedCloseHandler   http.Handler
	dynamicIndexHandler    http.Handler
	dynamicChunkHandler    http.Handler
	dynamicAppendHandler   http.Handler
	dynamicCloseHandler    http.Handler
	previousArchiveHandler http.Handler
	previousTimeHandler    http.Handler
	streamHandler          http.Handler // fallback 501-stub for unimplemented H2 paths
}

// NewHandler constructs a new upgrade Handler.
//
// blobHandler handles POST /blob; finishHandler handles POST /finish.
// fixed* handlers handle the fixed-index lifecycle (/fixed_index, /fixed_chunk, /fixed_close).
// dynamic* handlers handle the dynamic-index lifecycle (/dynamic_index, /dynamic_chunk, /dynamic_close).
// streamHandler is the fallback invoked for all other H2 paths (501 stub).
func NewHandler(
	datastores *datastore.Lookup,
	sessions *session.Store,
	db *sql.DB,
	blobHandler http.Handler,
	finishHandler http.Handler,
	fixedIndexHandler http.Handler,
	fixedChunkHandler http.Handler,
	fixedAppendHandler http.Handler,
	fixedCloseHandler http.Handler,
	dynamicIndexHandler http.Handler,
	dynamicChunkHandler http.Handler,
	dynamicAppendHandler http.Handler,
	dynamicCloseHandler http.Handler,
	previousArchiveHandler http.Handler,
	previousTimeHandler http.Handler,
	streamHandler http.Handler,
) *Handler {
	return &Handler{
		datastores:             datastores,
		sessions:               sessions,
		db:                     db,
		blobHandler:            blobHandler,
		finishHandler:          finishHandler,
		fixedIndexHandler:      fixedIndexHandler,
		fixedChunkHandler:      fixedChunkHandler,
		fixedAppendHandler:     fixedAppendHandler,
		fixedCloseHandler:      fixedCloseHandler,
		dynamicIndexHandler:    dynamicIndexHandler,
		dynamicChunkHandler:    dynamicChunkHandler,
		dynamicAppendHandler:   dynamicAppendHandler,
		dynamicCloseHandler:    dynamicCloseHandler,
		previousArchiveHandler: previousArchiveHandler,
		previousTimeHandler:    previousTimeHandler,
		streamHandler:          streamHandler,
	}
}

// ServeHTTP implements http.Handler. The auth middleware is expected to
// have already gated this and attached the Identity to the context.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Step 1: Validate Upgrade headers.
	if !hasUpgradeHeaders(r) {
		// Fallback to 501 — caller used /backup or /reader without upgrade.
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

	ns, err := namespace.Parse(params.Namespace)
	if err != nil {
		writeUpgradeError(w, http.StatusBadRequest, fmt.Sprintf("invalid namespace: %s", err))
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
		writeUpgradeError(w, http.StatusBadRequest, "invalid datastore name")
		return
	}
	if err != nil {
		slog.Error("datastore lookup failed", "error", err, "store", params.Store)
		writeUpgradeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Step 4: Begin session row (token from context, set by requireAuth).
	identity := auth.FromContext(r.Context())
	if identity == nil {
		slog.Error("upgrade reached without auth identity in context")
		writeUpgradeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := auth.AuthorizeDatastore(identity, ds.ID); err != nil {
		writeUpgradeError(w, http.StatusForbidden, "token not authorized for this datastore")
		slog.Info("upgrade rejected: datastore not authorized",
			"token_datastore_id", identity.TokenDatastoreID,
			"datastore_id", ds.ID,
			"remote", r.RemoteAddr,
		)
		return
	}

	authid := identity.Authid()
	if err := owner.SetIfAbsent(ds.Path, ns, string(params.BackupType), params.BackupID, authid); err != nil {
		if errors.Is(err, owner.ErrOwnerMismatch) {
			slog.Info("upgrade rejected: backup group owner mismatch",
				"user", authid,
				"datastore_id", ds.ID,
				"backup_type", params.BackupType,
				"backup_id", params.BackupID,
				"remote", r.RemoteAddr,
			)
			writeUpgradeError(w, http.StatusForbidden, "backup group owned by a different user")
			return
		}
		slog.Error("set owner failed", "error", err, "datastore_id", ds.ID)
		writeUpgradeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	kind := session.KindBackup
	if identifyKind(r.URL.Path) == "reader" {
		kind = session.KindReader
	}

	sessionID, err := h.sessions.Begin(session.BeginParams{
		TokenID:     identity.TokenID,
		DatastoreID: ds.ID,
		BackupType:  string(params.BackupType),
		BackupID:    params.BackupID,
		BackupTime:  params.BackupTime,
		Kind:        kind,
		Namespace:   params.Namespace,
	})
	if err != nil {
		slog.Error("session begin failed", "error", err, "datastore_id", ds.ID)
		writeUpgradeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Look up the most recent previous successful backup for this group.
	// Used by stream handlers to support incremental (reuse-csum) sessions.
	var prev *previous.Snapshot
	if kind == session.KindBackup {
		p, findErr := previous.Find(ds.Path, ns, string(params.BackupType), params.BackupID, params.BackupTime)
		if findErr == nil {
			prev = p
			slog.Info("previous backup found",
				"session_id", sessionID,
				"previous_path", p.Path,
				"previous_time", p.Time,
			)
		} else if !errors.Is(findErr, previous.ErrNoPrevious) {
			slog.Warn("previous backup lookup failed", "error", findErr, "session_id", sessionID)
		}
	}

	// Step 5: Hijack the connection.
	hj, ok := w.(http.Hijacker)
	if !ok {
		slog.Error("ResponseWriter does not support hijacking")
		writeUpgradeError(w, http.StatusInternalServerError, "hijack not supported")
		_, _ = h.sessions.Finalize(sessionID)
		return
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		slog.Error("hijack failed", "error", err)
		_, _ = h.sessions.Finalize(sessionID)
		return
	}
	// After Hijack, we own conn. ServeConn (below) blocks until the connection
	// ends and closes it for us on the success path.

	slog.Info("upgrade accepted",
		"path", r.URL.Path,
		"store", params.Store,
		"datastore_id", ds.ID,
		"session_id", sessionID,
		"backup_type", params.BackupType,
		"backup_id", params.BackupID,
		"backup_time", params.BackupTime,
		"namespace", params.Namespace,
		"remote", r.RemoteAddr,
	)

	// Step 6: Write the 101 response.
	if err := writeSwitchingProtocols(brw); err != nil {
		slog.Error("failed to write 101", "error", err, "session_id", sessionID)
		_ = conn.Close()
		_, _ = h.sessions.Finalize(sessionID)
		return
	}

	// Step 7: Hand off to http2.Server with a per-session router.
	//
	// Each H2 connection gets its own WriterState for in-memory fixed/dynamic
	// index writer maps. Cleanup drops any open writers when the connection closes.
	ws := wstate.New()
	defer ws.Cleanup()

	sessionCtx := &streamctx.SessionContext{
		SessionID:        sessionID,
		DatastoreID:      ds.ID,
		DatastoreRoot:    ds.Path,
		BackupType:       string(params.BackupType),
		BackupID:         params.BackupID,
		BackupTime:       params.BackupTime,
		Namespace:        ns,
		WriterState:      ws,
		PreviousBackup:   prev,
		SessionStartedAt: time.Now(),
	}

	// Insert synthetic job + run rows so this PBS backup appears in the web UI.
	// Best-effort: failures are logged but do not abort the backup.
	if h.db != nil && kind == session.KindBackup {
		jobID := jobsync.JobID(ds.ID, ns, string(params.BackupType), params.BackupID)
		if err := jobsync.UpsertJob(h.db, ds.ID, ns, string(params.BackupType), params.BackupID); err != nil {
			slog.Error("upgrade: failed to upsert synthetic job",
				"error", err, "session_id", sessionID, "job_id", jobID)
		} else {
			sessionCtx.JobID = jobID
			runID, runErr := jobsync.InsertRunningRun(h.db, jobID, sessionCtx.SessionStartedAt)
			if runErr != nil {
				slog.Error("upgrade: failed to insert synthetic run",
					"error", runErr, "session_id", sessionID, "job_id", jobID)
			} else {
				sessionCtx.RunID = runID
			}
		}
	}

	sessionRouter := buildSessionRouter(
		h.blobHandler, h.finishHandler,
		h.fixedIndexHandler, h.fixedChunkHandler,
		h.fixedAppendHandler, h.fixedCloseHandler,
		h.dynamicIndexHandler, h.dynamicChunkHandler,
		h.dynamicAppendHandler, h.dynamicCloseHandler,
		h.previousArchiveHandler, h.previousTimeHandler,
		h.streamHandler,
	)
	wrapped := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionRouter.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sessionCtx)))
	})

	h2srv := &http2.Server{}
	h2srv.ServeConn(conn, &http2.ServeConnOpts{
		Handler: wrapped,
	})

	// Step 8: Finalize on connection close.
	updated, finErr := h.sessions.Finalize(sessionID)
	if finErr != nil {
		slog.Error("session finalize failed", "error", finErr, "session_id", sessionID)
	}
	// If the session transitioned to aborted (no /finish received), mark the run failed.
	if updated && sessionCtx.RunID != "" {
		errMsg := "connection closed without /finish"
		if err := jobsync.FinishRun(h.db, sessionCtx.RunID, sessionCtx.JobID, "failed",
			nil, &errMsg, nil, sessionCtx.SessionStartedAt, time.Now()); err != nil {
			slog.Error("upgrade: abort path FinishRun failed",
				"error", err, "run_id", sessionCtx.RunID)
		}
	}
	slog.Info("upgrade connection closed",
		"path", r.URL.Path,
		"datastore_id", ds.ID,
		"session_id", sessionID,
		"finalized_to_aborted", updated,
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

// buildSessionRouter routes H2 streams to the appropriate handler.
// /fixed_index dispatches POST→fixedIndex and PUT→fixedAppend.
// /dynamic_index dispatches POST→dynamicIndex and PUT→dynamicAppend.
func buildSessionRouter(
	blobHandler, finishHandler,
	fixedIndexHandler, fixedChunkHandler, fixedAppendHandler, fixedCloseHandler,
	dynamicIndexHandler, dynamicChunkHandler, dynamicAppendHandler, dynamicCloseHandler,
	previousArchiveHandler, previousTimeHandler,
	fallback http.Handler,
) http.Handler {
	methodNotAllowed := func(w http.ResponseWriter, allow string) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", allow)
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/blob":
			blobHandler.ServeHTTP(w, r)
		case "/finish":
			finishHandler.ServeHTTP(w, r)
		case "/fixed_index":
			switch r.Method {
			case http.MethodPost:
				fixedIndexHandler.ServeHTTP(w, r)
			case http.MethodPut:
				fixedAppendHandler.ServeHTTP(w, r)
			default:
				methodNotAllowed(w, "POST, PUT")
			}
		case "/fixed_chunk":
			fixedChunkHandler.ServeHTTP(w, r)
		case "/fixed_close":
			fixedCloseHandler.ServeHTTP(w, r)
		case "/dynamic_index":
			switch r.Method {
			case http.MethodPost:
				dynamicIndexHandler.ServeHTTP(w, r)
			case http.MethodPut:
				dynamicAppendHandler.ServeHTTP(w, r)
			default:
				methodNotAllowed(w, "POST, PUT")
			}
		case "/dynamic_chunk":
			dynamicChunkHandler.ServeHTTP(w, r)
		case "/dynamic_close":
			dynamicCloseHandler.ServeHTTP(w, r)
		case "/previous":
			previousArchiveHandler.ServeHTTP(w, r)
		case "/previous_backup_time":
			previousTimeHandler.ServeHTTP(w, r)
		default:
			fallback.ServeHTTP(w, r)
		}
	})
}

// writeStub501 mirrors the existing main.go stub501 for the no-upgrade-headers fallback.
func writeStub501(w http.ResponseWriter, kind string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "PBS protocol " + kind + " endpoint pending — handler lands in M4c-go",
	})
}
