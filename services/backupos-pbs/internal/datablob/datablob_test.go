package datablob

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"testing"

	"github.com/klauspost/compress/zstd"
)

// makeUncompressedBlob builds a minimal uncompressed DataBlob from data.
// CRC is left as zeros (server doesn't re-verify CRC on ingest).
func makeUncompressedBlob(data []byte) []byte {
	blob := make([]byte, headerSizeUnencrypted+len(data))
	copy(blob[0:8], MagicUncompressed[:])
	// blob[8:12] = CRC32 zeros — not verified by server
	copy(blob[headerSizeUnencrypted:], data)
	return blob
}

// makeCompressedBlob builds a zstd-compressed DataBlob from data.
func makeCompressedBlob(t *testing.T, data []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	enc, err := zstd.NewWriter(&buf)
	if err != nil {
		t.Fatalf("zstd writer: %v", err)
	}
	if _, err := enc.Write(data); err != nil {
		t.Fatalf("zstd write: %v", err)
	}
	if err := enc.Close(); err != nil {
		t.Fatalf("zstd close: %v", err)
	}
	compressed := buf.Bytes()
	blob := make([]byte, headerSizeUnencrypted+len(compressed))
	copy(blob[0:8], MagicCompressed[:])
	copy(blob[headerSizeUnencrypted:], compressed)
	return blob
}

// makeEncryptedBlob builds a minimal encrypted DataBlob (payload is opaque zeros).
func makeEncryptedBlob() []byte {
	payload := make([]byte, 1)
	blob := make([]byte, headerSizeEncrypted+len(payload))
	copy(blob[0:8], MagicEncrypted[:])
	copy(blob[headerSizeEncrypted:], payload)
	return blob
}

func TestParse_Uncompressed(t *testing.T) {
	raw := makeUncompressedBlob([]byte("hello"))
	b, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if b.Kind() != KindUncompressed {
		t.Errorf("kind: got %d, want KindUncompressed", b.Kind())
	}
	if b.IsEncrypted() {
		t.Error("IsEncrypted should be false")
	}
}

func TestParse_RejectsUnknownMagic(t *testing.T) {
	raw := make([]byte, 20)
	raw[0] = 0xFF // not a valid magic byte sequence
	_, err := Parse(raw)
	if err == nil {
		t.Error("expected error for unknown magic, got nil")
	}
}

func TestParse_RejectsTooShort(t *testing.T) {
	_, err := Parse([]byte{1, 2, 3})
	if err == nil {
		t.Error("expected error for too-short blob, got nil")
	}
}

func TestVerifyUnencrypted_Uncompressed_HappyPath(t *testing.T) {
	data := []byte("test payload")
	raw := makeUncompressedBlob(data)
	b, _ := Parse(raw)
	digest := sha256.Sum256(data)
	if err := b.VerifyUnencrypted(uint32(len(data)), digest); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestVerifyUnencrypted_Compressed_HappyPath(t *testing.T) {
	data := []byte("test payload for compression test — longer to make compression meaningful")
	raw := makeCompressedBlob(t, data)
	b, _ := Parse(raw)
	digest := sha256.Sum256(data)
	if err := b.VerifyUnencrypted(uint32(len(data)), digest); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestVerifyUnencrypted_DigestMismatch(t *testing.T) {
	data := []byte("test")
	raw := makeUncompressedBlob(data)
	b, _ := Parse(raw)
	var wrongDigest [32]byte
	wrongDigest[0] = 0xFF
	err := b.VerifyUnencrypted(uint32(len(data)), wrongDigest)
	if !errors.Is(err, ErrDigestMismatch) {
		t.Errorf("expected ErrDigestMismatch, got %v", err)
	}
}

func TestVerifyUnencrypted_SizeMismatch(t *testing.T) {
	data := []byte("test")
	raw := makeUncompressedBlob(data)
	b, _ := Parse(raw)
	digest := sha256.Sum256(data)
	err := b.VerifyUnencrypted(uint32(len(data))+1, digest) // wrong size
	if !errors.Is(err, ErrSizeMismatch) {
		t.Errorf("expected ErrSizeMismatch, got %v", err)
	}
}

func TestVerifyUnencrypted_SkipsEncryptedBlobs(t *testing.T) {
	raw := makeEncryptedBlob()
	b, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !b.IsEncrypted() {
		t.Error("expected IsEncrypted=true")
	}
	// VerifyUnencrypted must return nil for encrypted blobs regardless of inputs.
	var anyDigest [32]byte
	if err := b.VerifyUnencrypted(999, anyDigest); err != nil {
		t.Errorf("expected nil for encrypted blob, got %v", err)
	}
}
