// Package didx provides reader-side helpers for .didx (dynamic index) files.
//
// File layout:
//   - 4096-byte header: magic[8] + uuid[16] + ctime[8] + index_csum[32] + reserved[4032]
//   - N entries of 40 bytes each: end_le[8] + digest[32]
//
// index_csum = SHA256(end1_le || digest1 || end2_le || digest2 || ...)
//
// Mirrors pbs-datastore/src/dynamic_index.rs:{DynamicIndexHeader, DynamicEntry}.
package didx

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	headerSize = 4096
	entrySize  = 40

	// MaxChunkSize sanity-bounds per-chunk size during reuse registration.
	// PBS's dynamic chunker typically produces chunks in the 1–8 MiB range;
	// 64 MiB is a generous ceiling that catches corrupt/malicious indexes.
	MaxChunkSize uint64 = 64 * 1024 * 1024
)

// Magic is the didx file magic.
// Mirrors pbs-datastore/src/file_formats.rs:DYNAMIC_INDEX_MAGIC_2.
var Magic = [8]byte{28, 145, 78, 165, 25, 186, 179, 205}

// Header contains metadata decoded from a .didx file header.
type Header struct {
	IndexCsum [32]byte // SHA256 over (end_le || digest) pairs
}

// ChunkRef is a single (end_le, digest) entry from a .didx file.
type ChunkRef struct {
	End    uint64
	Digest [32]byte
}

// ReadHeader reads and validates the 4096-byte didx header from r.
// On success r is positioned at byte 4096, ready for ReadEntries.
func ReadHeader(r io.Reader) (*Header, error) {
	buf := make([]byte, headerSize)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, fmt.Errorf("read didx header: %w", err)
	}
	var magic [8]byte
	copy(magic[:], buf[0:8])
	if magic != Magic {
		return nil, fmt.Errorf("invalid didx magic")
	}
	var h Header
	// header layout: magic[8] + uuid[16] + ctime[8] + index_csum[32]
	// → index_csum starts at offset 32
	copy(h.IndexCsum[:], buf[32:64])
	return &h, nil
}

// ReadEntries reads all 40-byte entries from r (positioned after the header).
//
// Validates:
//   - end_le values are monotonically non-decreasing
//   - Per-chunk size (end[i] - end[i-1]) <= MaxChunkSize
func ReadEntries(r io.Reader) ([]ChunkRef, error) {
	var entries []ChunkRef
	var prevEnd uint64

	for i := 0; ; i++ {
		var entryBuf [entrySize]byte
		_, err := io.ReadFull(r, entryBuf[:])
		if errors.Is(err, io.EOF) {
			break
		}
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return nil, fmt.Errorf("didx entry %d: truncated (need %d bytes)", i, entrySize)
		}
		if err != nil {
			return nil, fmt.Errorf("read didx entry %d: %w", i, err)
		}

		end := binary.LittleEndian.Uint64(entryBuf[0:8])
		if end < prevEnd {
			return nil, fmt.Errorf("didx entry %d: end_le %d is less than previous %d", i, end, prevEnd)
		}
		chunkSize := end - prevEnd
		if chunkSize > MaxChunkSize {
			return nil, fmt.Errorf("didx entry %d: chunk size %d exceeds max %d", i, chunkSize, MaxChunkSize)
		}

		var digest [32]byte
		copy(digest[:], entryBuf[8:40])
		entries = append(entries, ChunkRef{End: end, Digest: digest})
		prevEnd = end
	}
	return entries, nil
}
