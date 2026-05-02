// Package sessionreaper periodically aborts stale pbs_active_sessions rows.
//
// A session is stale when it has been in state 'backup' or 'reader' for
// longer than StaleThreshold. This happens when a backup client crashes
// mid-upload: the HTTP/2 connection closes, Finalize() is called, but if
// that path fails (e.g. a panic before Finalize runs), the row stays
// active. Stale rows poison GC's safety extension by making
// OldestActiveStartedAt return ancient timestamps.
//
// The UPDATE is a single statement — no read-modify-write — so it cannot
// race with session.Finish() or session.Finalize().
package sessionreaper

import (
	"context"
	"database/sql"
	"log/slog"
	"time"
)

// DefaultStaleThreshold is how long a session can remain in an active state
// before the reaper considers it crashed. Generous on purpose: a legitimate
// slow upload over a poor link still completes in minutes, not an hour.
const DefaultStaleThreshold = 1 * time.Hour

// DefaultInterval is how often the reaper sweeps.
const DefaultInterval = 5 * time.Minute

// Reaper periodically sweeps stale sessions in pbs_active_sessions.
type Reaper struct {
	db       *sql.DB
	stale    time.Duration
	interval time.Duration
}

// New constructs a Reaper. Zero values for stale and interval use the defaults.
func New(db *sql.DB, stale, interval time.Duration) *Reaper {
	if stale == 0 {
		stale = DefaultStaleThreshold
	}
	if interval == 0 {
		interval = DefaultInterval
	}
	return &Reaper{db: db, stale: stale, interval: interval}
}

// Run blocks until ctx is cancelled, sweeping at the configured interval.
// It sweeps once immediately on start to catch sessions left over from a
// previous process crash. Errors from individual sweeps are logged but do
// not abort the loop.
func (r *Reaper) Run(ctx context.Context) {
	slog.Info("session reaper started",
		"stale_threshold", r.stale,
		"interval", r.interval,
	)

	r.sweep(ctx)

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("session reaper stopped")
			return
		case <-ticker.C:
			r.sweep(ctx)
		}
	}
}

func (r *Reaper) sweep(ctx context.Context) {
	n, err := r.SweepOnce(ctx)
	if err != nil {
		slog.Warn("session reaper sweep failed", "error", err)
		return
	}
	if n > 0 {
		slog.Info("session reaper aborted stale sessions", "count", n)
	}
}

// SweepOnce runs one sweep, marking sessions older than the stale threshold
// as 'aborted'. Returns the number of rows affected.
//
// Only 'backup' and 'reader' rows are touched — 'finished' and 'aborted'
// rows are left unchanged.
func (r *Reaper) SweepOnce(ctx context.Context) (int64, error) {
	cutoff := time.Now().Add(-r.stale).UnixMilli()
	const q = `
		UPDATE pbs_active_sessions
		SET state = 'aborted'
		WHERE state IN ('backup', 'reader')
		  AND started_at < ?
	`
	res, err := r.db.ExecContext(ctx, q, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
