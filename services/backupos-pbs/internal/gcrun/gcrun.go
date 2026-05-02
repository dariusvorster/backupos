// Package gcrun orchestrates a full garbage collection cycle.
//
// Execution order:
//  1. VerifyAtimeUpdates — abort if the filesystem does not honor atime.
//  2. AcquireExclusive  — acquire per-datastore flock; abort if already locked.
//  3. Mark              — walk snapshots, touch atime on every referenced chunk.
//  4. OldestActiveWriter— query the oldest active backup session start time.
//  5. Sweep             — three-way decision per chunk; delete stale, keep in-use or pending.
//
// DefaultCutoff is the age at which an unreferenced chunk becomes eligible for
// deletion. OldestWriterSafety (defined in gcsweep) is applied on top when an
// active backup session started before the cutoff.
package gcrun

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/chunkstore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dslock"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcatime"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcmark"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcsweep"
)

// DefaultCutoff is the minimum age for a chunk to be eligible for deletion.
// A chunk whose atime is older than (now - DefaultCutoff) has not been
// referenced in over 24 hours and is safe to remove.
const DefaultCutoff = 24*time.Hour + 5*time.Minute

// OldestActiveWriterFunc returns the start time of the oldest active backup
// session, or the zero time if there are none.
type OldestActiveWriterFunc func(ctx context.Context) (time.Time, error)

// Run executes a full GC cycle for the given datastore root.
// It calls oldestWriterFn to query the oldest active backup session.
// Returns the aggregated sweep status on success.
func Run(ctx context.Context, datastoreRoot string, oldestWriterFn OldestActiveWriterFunc) (*gcstatus.Status, error) {
	if err := gcatime.VerifyAtimeUpdates(datastoreRoot); err != nil {
		return nil, fmt.Errorf("atime verification failed — aborting GC: %w", err)
	}

	lock, err := dslock.AcquireExclusive(datastoreRoot)
	if err != nil {
		return nil, fmt.Errorf("acquire GC lock: %w", err)
	}
	defer func() {
		if err := lock.Release(); err != nil {
			slog.Warn("gc: failed to release lock", "error", err)
		}
	}()

	minAtime := time.Now().Add(-DefaultCutoff)

	markStats, err := gcmark.Mark(ctx, datastoreRoot)
	if err != nil {
		return nil, fmt.Errorf("gc mark: %w", err)
	}
	slog.Info("gc run: mark complete", "stats", fmt.Sprintf("%+v", markStats))

	oldestWriter, err := oldestWriterFn(ctx)
	if err != nil {
		return nil, fmt.Errorf("query oldest writer: %w", err)
	}

	store, err := chunkstore.New(datastoreRoot)
	if err != nil {
		return nil, fmt.Errorf("open chunk store: %w", err)
	}

	status := &gcstatus.Status{}
	if err := gcsweep.Sweep(ctx, store, oldestWriter, minAtime, status); err != nil {
		return status, fmt.Errorf("gc sweep: %w", err)
	}

	slog.Info("gc run: sweep complete", "status", status.String())
	return status, nil
}
