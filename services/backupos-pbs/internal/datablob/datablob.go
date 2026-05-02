// Package datablob parses and verifies the PBS DataBlob wire format.
//
// Wire format:
//
//	offset 0:  magic [8]byte  — one of the four blob magic constants
//	offset 8:  crc   [4]byte  — CRC32 of payload (server stores as-is; client verifies)
//	offset 12: data           — raw / compressed / encrypted payload
//
// Encrypted variants have an extended header:
//
//	offset 12: iv  [16]byte
//	offset 28: tag [16]byte
//	offset 44: encrypted data
package datablob

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	"github.com/klauspost/compress/zstd"
)

// Magic constants from pbs-datastore/src/file_formats.rs — do not modify.
var (
	MagicUncompressed = [8]byte{66, 171, 56, 7, 190, 131, 112, 161}
	MagicCompressed   = [8]byte{49, 185, 88, 66, 111, 182, 163, 127}
	MagicEncrypted    = [8]byte{123, 103, 133, 190, 34, 45, 76, 240}
	MagicEncrCompr    = [8]byte{230, 89, 27, 191, 11, 191, 216, 11}
)

const (
	headerSizeUnencrypted = 12
	headerSizeEncrypted   = 44
	maxBlobPlaintext      = 16 * 1024 * 1024
)

// Kind identifies the encoding of a DataBlob.
type Kind int

const (
	KindUnknown Kind = iota
	KindUncompressed
	KindCompressed
	KindEncrypted
	KindEncrCompr
)

// ErrDigestMismatch is returned when SHA256(plaintext) does not match the
// expected digest supplied by the caller.
var ErrDigestMismatch = errors.New("blob plaintext digest mismatch")

// ErrSizeMismatch is returned when the decompressed plaintext length does not
// match the expected size supplied by the caller.
var ErrSizeMismatch = errors.New("blob plaintext size mismatch")

// Blob is a parsed PBS DataBlob. It holds the raw wire bytes and the decoded
// kind; the full payload is decoded on demand.
type Blob struct {
	raw  []byte
	kind Kind
}

// Parse parses raw DataBlob bytes and validates the magic header.
// It does NOT decompress or verify the payload — call VerifyUnencrypted for that.
func Parse(raw []byte) (*Blob, error) {
	if len(raw) < headerSizeUnencrypted {
		return nil, fmt.Errorf("blob too short (%d bytes)", len(raw))
	}
	var magic [8]byte
	copy(magic[:], raw[:8])

	var kind Kind
	var minHeader int
	switch magic {
	case MagicUncompressed:
		kind, minHeader = KindUncompressed, headerSizeUnencrypted
	case MagicCompressed:
		kind, minHeader = KindCompressed, headerSizeUnencrypted
	case MagicEncrypted:
		kind, minHeader = KindEncrypted, headerSizeEncrypted
	case MagicEncrCompr:
		kind, minHeader = KindEncrCompr, headerSizeEncrypted
	default:
		return nil, fmt.Errorf("unknown blob magic %v", magic)
	}

	if len(raw) < minHeader {
		return nil, fmt.Errorf("blob too short for kind %d (%d < %d)", kind, len(raw), minHeader)
	}
	return &Blob{raw: raw, kind: kind}, nil
}

// Kind returns the encoding kind of the blob.
func (b *Blob) Kind() Kind { return b.kind }

// Raw returns the full wire bytes of the blob.
func (b *Blob) Raw() []byte { return b.raw }

// IsEncrypted reports whether the blob uses encryption.
func (b *Blob) IsEncrypted() bool {
	return b.kind == KindEncrypted || b.kind == KindEncrCompr
}

// CRC returns the CRC32 stored in the blob header (client-computed; not
// re-verified by the server on ingest).
func (b *Blob) CRC() uint32 {
	return binary.LittleEndian.Uint32(b.raw[8:12])
}

// VerifyUnencrypted decodes the plaintext, checks its length against
// expectedSize, and verifies SHA256(plaintext) == expectedDigest.
//
// For encrypted blobs this is a no-op (returns nil) because the server cannot
// decrypt them.
func (b *Blob) VerifyUnencrypted(expectedSize uint32, expectedDigest [32]byte) error {
	if b.IsEncrypted() {
		return nil
	}
	plaintext, err := b.plaintext()
	if err != nil {
		return fmt.Errorf("decode plaintext: %w", err)
	}
	if uint32(len(plaintext)) != expectedSize {
		return fmt.Errorf("%w: got %d, want %d", ErrSizeMismatch, len(plaintext), expectedSize)
	}
	gotDigest := sha256.Sum256(plaintext)
	if gotDigest != expectedDigest {
		return ErrDigestMismatch
	}
	return nil
}

// plaintext extracts and (if necessary) decompresses the data payload.
// Only valid for unencrypted kinds.
func (b *Blob) plaintext() ([]byte, error) {
	switch b.kind {
	case KindUncompressed:
		return b.raw[headerSizeUnencrypted:], nil
	case KindCompressed:
		dec, err := zstd.NewReader(bytes.NewReader(b.raw[headerSizeUnencrypted:]))
		if err != nil {
			return nil, err
		}
		defer dec.Close()
		buf, err := io.ReadAll(io.LimitReader(dec, maxBlobPlaintext+1))
		if err != nil {
			return nil, err
		}
		if len(buf) > maxBlobPlaintext {
			return nil, fmt.Errorf("decompressed size exceeds %d byte cap", maxBlobPlaintext)
		}
		return buf, nil
	default:
		return nil, fmt.Errorf("plaintext not available for kind %d", b.kind)
	}
}
