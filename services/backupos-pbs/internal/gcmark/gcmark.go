// Package gcmark implements the mark phase of garbage collection.
//
// Walks every snapshot directory in the datastore, enumerates chunk digests
// from each .fidx and .didx file, and touches atime on every referenced
// chunk in the chunk store. This is the read-only half of GC; sweep happens
// in M6b.
//
// Caller MUST hold the per-datastore exclusive lock (dslock.AcquireExclusive)
// before invoking Mark, and MUST have called gcatime.VerifyAtimeUpdates first.
package gcmark

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"path/filepath"
	"strings"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/chunkstore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcatime"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/indexread"
)

// Stats records what the mark phase observed.
type Stats struct {
	SnapshotsProcessed  int
	IndexFilesProcessed int
	DigestsTouched      int64
	Errors              []error
}

// Mark walks the datastore and touches atime on every chunk referenced by
// any .fidx or .didx file found under any snapshot directory.
//
// The walk skips .chunks/ and .gc-probe/ — those hold data managed
// by the chunk store, not snapshot indexes.
//
// Non-fatal errors (missing chunks, parse failures) are accumulated in
// Stats.Errors rather than aborting the walk.
func Mark(ctx context.Context, datastoreRoot string) (*Stats, error) {
	store, err := chunkstore.New(datastoreRoot)
	if err != nil {
		return nil, fmt.Errorf("open chunk store: %w", err)
	}

	stats := &Stats{}
	snapDirs := make(map[string]struct{})

	err = filepath.WalkDir(datastoreRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			stats.Errors = append(stats.Errors, fmt.Errorf("walk %s: %w", path, walkErr))
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if d.IsDir() {
			base := d.Name()
			// Never descend into the chunk store or GC probe directory.
			if base == ".chunks" || base == ".gc-probe" {
				return fs.SkipDir
			}
			return nil
		}

		name := d.Name()
		if !strings.HasSuffix(name, ".fidx") && !strings.HasSuffix(name, ".didx") {
			return nil
		}

		digests, err := indexread.EnumerateDigests(path)
		if err != nil {
			stats.Errors = append(stats.Errors, fmt.Errorf("enumerate %s: %w", path, err))
			return nil
		}

		for _, digest := range digests {
			chunkPath := store.Path(digest)
			touched, err := gcatime.TouchChunk(chunkPath)
			if err != nil {
				stats.Errors = append(stats.Errors, fmt.Errorf("touch %x: %w", digest, err))
				continue
			}
			if touched {
				stats.DigestsTouched++
			}
		}

		stats.IndexFilesProcessed++
		snapDirs[filepath.Dir(path)] = struct{}{}

		slog.Info("gc mark: index processed",
			"path", path,
			"digests", len(digests),
		)
		return nil
	})

	if err != nil {
		return stats, fmt.Errorf("walk datastore: %w", err)
	}

	stats.SnapshotsProcessed = len(snapDirs)

	slog.Info("gc mark: completed",
		"snapshots", stats.SnapshotsProcessed,
		"index_files", stats.IndexFilesProcessed,
		"digests_touched", stats.DigestsTouched,
		"errors", len(stats.Errors),
	)

	return stats, nil
}
