// Package gcsweep implements the sweep phase of garbage collection.
//
// For each chunk in the chunk store it makes a three-way decision:
//
//	atime < minAtime              → delete (stale, no live reference)
//	minAtime ≤ atime < oldestWriter → pending (may be referenced by an active backup)
//	atime ≥ oldestWriter          → in-use (recently touched by mark or in-flight writer)
//
// If oldestWriter is earlier than minAtime, minAtime is extended backwards
// by OldestWriterSafety to avoid deleting chunks written by an active session
// that started before the GC cutoff was computed.
//
// Caller MUST hold the per-datastore exclusive lock before invoking Sweep.
package gcsweep

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/chunkstore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
)

// OldestWriterSafety is subtracted from oldestWriter when computing an
// extended minAtime, to guard against chunks written by a session that
// started just before the GC cutoff was captured.
const OldestWriterSafety = 5 * time.Minute

// Sweep iterates over every chunk in store, decides its fate, and updates
// status accordingly. Chunk deletions are serialized with concurrent inserts
// via store.LockMutex().
func Sweep(ctx context.Context, store *chunkstore.Store, oldestWriter time.Time, minAtime time.Time, status *gcstatus.Status) error {
	effectiveMin := minAtime
	if !oldestWriter.IsZero() && oldestWriter.Before(minAtime) {
		effectiveMin = oldestWriter.Add(-OldestWriterSafety)
	}

	return store.Iterate(ctx, func(_ [32]byte, path string, _ time.Time) error {
		unlock := store.LockMutex()

		// Re-stat under the store mutex to get size and a fresh atime,
		// preventing a race where Insert() updated atime after Iterate read it.
		info, err := os.Lstat(path)
		if err != nil {
			unlock()
			if os.IsNotExist(err) {
				return nil // concurrently deleted; skip
			}
			return fmt.Errorf("stat chunk %s: %w", path, err)
		}
		size := info.Size()
		freshAtime := chunkstore.AtimeFromPath(path)

		status.DiskChunks++
		status.DiskBytes += size

		switch {
		case freshAtime.Before(effectiveMin):
			err := os.Remove(path)
			unlock()
			if err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove chunk %s: %w", path, err)
			}
			status.RemovedChunks++
			status.RemovedBytes += size
			slog.Debug("gc sweep: removed chunk", "path", path)

		case !oldestWriter.IsZero() && freshAtime.Before(oldestWriter):
			unlock()
			status.PendingChunks++
			status.PendingBytes += size

		default:
			unlock()
		}

		return nil
	})
}
