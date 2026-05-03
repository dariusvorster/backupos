// Package streamctx carries per-session context to H2 stream handlers.
//
// After the upgrade handshake completes, every H2 stream on that connection
// shares the same session: same datastore, same backup type/id/time. Stream
// handlers (POST /blob, POST /fixed_index, etc.) need this context to know
// where on the filesystem to write data.
//
// The upgrade handler attaches a SessionContext to each stream's request via
// a wrapper http.Handler; stream handlers retrieve it via FromRequest.
package streamctx

import (
	"context"
	"net/http"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/rstate"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// SessionContext holds everything a per-stream handler needs to know about
// the session it's serving. Once the upgrade handshake completes, this is
// constant for the lifetime of the H2 connection.
type SessionContext struct {
	SessionID     string       // pbs_active_sessions.id (UUID)
	DatastoreID   string       // pbs_datastores.id
	DatastoreRoot string       // absolute filesystem path of the datastore
	BackupType    string       // "vm" | "ct" | "host"
	BackupID      string       // e.g. "100"
	BackupTime    time.Time    // backup-time
	Namespace     namespace.Namespace // root if no ?ns= provided
	WriterState    *wstate.State      // per-session writer state (fixed/dynamic index maps); nil for reader sessions
	ReaderState    *rstate.State      // per-session reader state (allowed_chunks set); nil for backup sessions
	PreviousBackup *previous.Snapshot // most recent prior snapshot for this group, nil if none
}

type ctxKey struct{}

// WithSession returns a child context carrying the given SessionContext.
func WithSession(ctx context.Context, sc *SessionContext) context.Context {
	return context.WithValue(ctx, ctxKey{}, sc)
}

// FromContext returns the SessionContext attached to ctx, or nil if none.
func FromContext(ctx context.Context) *SessionContext {
	sc, _ := ctx.Value(ctxKey{}).(*SessionContext)
	return sc
}

// FromRequest is sugar for FromContext(r.Context()).
func FromRequest(r *http.Request) *SessionContext {
	return FromContext(r.Context())
}
