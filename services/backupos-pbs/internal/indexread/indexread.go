// Package indexread provides minimal readers for PBS .fidx and .didx files.
//
// Unlike the writers in internal/fidx and internal/didx, these readers
// only need to enumerate chunk digests for chunk-access registration.
// They do NOT decode the full index semantics (chunk offsets, ranges,
// file sizes, etc.) — that's the client's job during restore.
//
// Header layout is identical to what the writers produce; see
// internal/fidx/fidx.go and internal/didx/didx.go for the full format.
package indexread

import (
	"errors"
	"fmt"
	"io"
	"os"
)

const (
	headerSize    = 4096
	fidxEntrySize = 32
	didxEntrySize = 40
)

// MagicFidx is the fixed-index magic from PBS file_formats.rs.
var MagicFidx = [8]byte{47, 127, 65, 237, 145, 253, 15, 205}

// MagicDidx is the dynamic-index magic from PBS file_formats.rs.
var MagicDidx = [8]byte{28, 145, 78, 165, 25, 186, 179, 205}

// IndexType identifies which kind of index a file is.
type IndexType int

const (
	IndexUnknown IndexType = iota
	IndexFixed
	IndexDynamic
)

// DetectType opens the file, reads the magic bytes, and returns the type.
// Returns IndexUnknown (nil error) for any unrecognized magic.
func DetectType(path string) (IndexType, error) {
	f, err := os.Open(path)
	if err != nil {
		return IndexUnknown, err
	}
	defer f.Close()

	var magic [8]byte
	if _, err := io.ReadFull(f, magic[:]); err != nil {
		return IndexUnknown, fmt.Errorf("read magic: %w", err)
	}
	switch magic {
	case MagicFidx:
		return IndexFixed, nil
	case MagicDidx:
		return IndexDynamic, nil
	}
	return IndexUnknown, nil
}

// EnumerateDigests reads every chunk digest from the index file. The file
// is opened, parsed, and closed inside this function — it does NOT consume
// an open file handle the caller may need to stream back.
func EnumerateDigests(path string) ([][32]byte, error) {
	t, err := DetectType(path)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	fileSize := st.Size()
	if fileSize < headerSize {
		return nil, fmt.Errorf("index file too short: %d bytes", fileSize)
	}

	bodyLen := fileSize - headerSize

	switch t {
	case IndexFixed:
		if bodyLen%fidxEntrySize != 0 {
			return nil, fmt.Errorf("fidx body not aligned: %d bytes", bodyLen)
		}
		count := bodyLen / fidxEntrySize
		if _, err := f.Seek(headerSize, io.SeekStart); err != nil {
			return nil, err
		}
		digests := make([][32]byte, count)
		for i := int64(0); i < count; i++ {
			if _, err := io.ReadFull(f, digests[i][:]); err != nil {
				return nil, fmt.Errorf("read fidx digest %d: %w", i, err)
			}
		}
		return digests, nil

	case IndexDynamic:
		if bodyLen%didxEntrySize != 0 {
			return nil, fmt.Errorf("didx body not aligned: %d bytes", bodyLen)
		}
		count := bodyLen / didxEntrySize
		if _, err := f.Seek(headerSize, io.SeekStart); err != nil {
			return nil, err
		}
		digests := make([][32]byte, count)
		var entry [didxEntrySize]byte
		for i := int64(0); i < count; i++ {
			if _, err := io.ReadFull(f, entry[:]); err != nil {
				return nil, fmt.Errorf("read didx entry %d: %w", i, err)
			}
			// entry layout: end_le[0:8] || digest[8:40]
			copy(digests[i][:], entry[8:40])
		}
		return digests, nil

	default:
		return nil, errors.New("not an index file")
	}
}
