// Package incremental implements pre-population of knownChunks from a previous
// backup's index file for incremental (reuse-csum) backup sessions.
package incremental

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

// ErrCsumMismatch is returned when the reuse-csum supplied by the client does
// not match the index_csum stored in the previous archive. Maps to HTTP 400.
var ErrCsumMismatch = errors.New("reuse-csum mismatch with previous backup")

// RegisterFromPreviousIndex opens the previous backup's .fidx file at
// previousIndexPath, validates that its index_csum equals expectedCsum, and
// registers every chunk digest into s's knownChunks map.
//
// Returns the count of registered digests.
//
// Errors:
//   - ErrCsumMismatch: stored csum != expectedCsum
//   - os.ErrNotExist (wrapped): file not found
//   - other I/O errors as appropriate
//
// This does NOT verify that the chunks themselves still exist on disk. The
// close-time validation in wstate catches the rare GC race; GC is separately
// prevented from removing live chunks by the oldest_writer extension.
func RegisterFromPreviousIndex(s *wstate.State, previousIndexPath string, expectedCsum [32]byte) (int, error) {
	f, err := os.Open(previousIndexPath)
	if err != nil {
		return 0, fmt.Errorf("open previous index: %w", err)
	}
	defer f.Close()

	header, err := fidx.ReadHeader(f)
	if err != nil {
		return 0, fmt.Errorf("read previous fidx header: %w", err)
	}

	if header.IndexCsum != expectedCsum {
		return 0, fmt.Errorf("%w: stored=%s, requested=%s",
			ErrCsumMismatch,
			hex.EncodeToString(header.IndexCsum[:]),
			hex.EncodeToString(expectedCsum[:]))
	}

	digests, err := fidx.ReadDigests(f)
	if err != nil {
		return 0, fmt.Errorf("read previous fidx digests: %w", err)
	}

	for _, digest := range digests {
		s.RegisterKnownChunk(digest, header.ChunkSize)
	}
	return len(digests), nil
}

// RegisterFromPreviousDynamicIndex opens the previous backup's .didx file at
// previousIndexPath, validates that its index_csum equals expectedCsum, and
// registers every chunk digest into s's knownChunks map with the correct
// per-chunk size derived from end_le deltas.
//
// Returns the count of registered digests.
//
// Errors:
//   - ErrCsumMismatch: stored csum != expectedCsum
//   - os.ErrNotExist (wrapped): file not found
//   - other I/O / validation errors as appropriate
func RegisterFromPreviousDynamicIndex(s *wstate.State, previousIndexPath string, expectedCsum [32]byte) (int, error) {
	f, err := os.Open(previousIndexPath)
	if err != nil {
		return 0, fmt.Errorf("open previous didx: %w", err)
	}
	defer f.Close()

	header, err := didx.ReadHeader(f)
	if err != nil {
		return 0, fmt.Errorf("read previous didx header: %w", err)
	}

	if header.IndexCsum != expectedCsum {
		return 0, fmt.Errorf("%w: stored=%s, requested=%s",
			ErrCsumMismatch,
			hex.EncodeToString(header.IndexCsum[:]),
			hex.EncodeToString(expectedCsum[:]))
	}

	entries, err := didx.ReadEntries(f)
	if err != nil {
		return 0, fmt.Errorf("read previous didx entries: %w", err)
	}

	var prevEnd uint64
	for _, entry := range entries {
		chunkSize := entry.End - prevEnd
		// chunkSize fits in uint32 because didx.ReadEntries enforces MaxChunkSize=64MiB
		s.RegisterKnownChunk(entry.Digest, uint32(chunkSize))
		prevEnd = entry.End
	}
	return len(entries), nil
}
