package fidx

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// Header contains the metadata decoded from a .fidx file header.
type Header struct {
	IndexCsum [32]byte // SHA256 of the digest bytes
	Size      uint64   // total content size in bytes
	ChunkSize uint32   // chunk size in bytes (always 4 MiB in V1)
}

// ReadHeader reads and validates the 4096-byte header from r.
// On success r is positioned at byte 4096, ready for ReadDigests.
func ReadHeader(r io.Reader) (*Header, error) {
	buf := make([]byte, headerSize)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, fmt.Errorf("read fidx header: %w", err)
	}
	var magic [8]byte
	copy(magic[:], buf[0:8])
	if magic != Magic {
		return nil, fmt.Errorf("invalid fidx magic")
	}
	var h Header
	copy(h.IndexCsum[:], buf[32:64])
	h.Size = binary.LittleEndian.Uint64(buf[64:72])
	chunkSizeU64 := binary.LittleEndian.Uint64(buf[72:80])
	if chunkSizeU64 == 0 || chunkSizeU64 > (1<<30) {
		return nil, fmt.Errorf("fidx chunk_size %d out of range", chunkSizeU64)
	}
	h.ChunkSize = uint32(chunkSizeU64)
	return &h, nil
}

// ReadDigests reads all chunk digests from r (positioned after the header).
// Each digest is 32 bytes; reading stops at EOF.
// Returns an error if the data is not a multiple of 32 bytes.
func ReadDigests(r io.Reader) ([][32]byte, error) {
	var digests [][32]byte
	for {
		var d [32]byte
		_, err := io.ReadFull(r, d[:])
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read fidx digest: %w", err)
		}
		digests = append(digests, d)
	}
	return digests, nil
}
