package fidx

import (
	"crypto/sha256"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testChunkSize = 4 * 1024 * 1024 // 4 MiB

func TestCreate_RejectsNonPowerOfTwo(t *testing.T) {
	dir := t.TempDir()
	_, err := Create(filepath.Join(dir, "test.fidx"), 4194304, 3)
	if err == nil {
		t.Error("expected error for non-power-of-two chunk_size")
	}
}

func TestCreate_RejectsZeroChunkSize(t *testing.T) {
	dir := t.TempDir()
	_, err := Create(filepath.Join(dir, "test.fidx"), 4194304, 0)
	if err == nil {
		t.Error("expected error for zero chunk_size")
	}
}

func TestCreate_RejectsZeroSize(t *testing.T) {
	dir := t.TempDir()
	_, err := Create(filepath.Join(dir, "test.fidx"), 0, testChunkSize)
	if err == nil {
		t.Error("expected error for zero content size (growable not supported)")
	}
}

// TestAddChunk_AndClose_ByteExact verifies the complete .fidx file layout
// against the spec. This is the moment-of-truth test — offsets, magic,
// uuid, ctime, index_csum, size, chunk_size, and digest positions.
func TestAddChunk_AndClose_ByteExact(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.fidx")

	totalSize := uint64(2 * testChunkSize)
	w, err := Create(path, totalSize, testChunkSize)
	if err != nil {
		t.Fatal(err)
	}

	// Build two distinct digests.
	var digest0, digest1 [32]byte
	for i := range digest0 {
		digest0[i] = byte(i)
	}
	for i := range digest1 {
		digest1[i] = byte(i + 32)
	}

	// offset = end of chunk (PBS convention).
	if err := w.AddChunk(uint64(testChunkSize), uint32(testChunkSize), digest0); err != nil {
		t.Fatalf("AddChunk 0: %v", err)
	}
	if err := w.AddChunk(totalSize, uint32(testChunkSize), digest1); err != nil {
		t.Fatalf("AddChunk 1: %v", err)
	}

	before := time.Now().Unix()
	csum, err := w.Close()
	if err != nil {
		t.Fatalf("Close: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fidx: %v", err)
	}

	expectedFileSize := headerSize + 2*digestSize
	if len(data) != expectedFileSize {
		t.Errorf("file size: got %d, want %d", len(data), expectedFileSize)
	}

	// Magic at 0:8.
	var gotMagic [8]byte
	copy(gotMagic[:], data[0:8])
	if gotMagic != Magic {
		t.Errorf("magic mismatch: got %v, want %v", gotMagic, Magic)
	}

	// UUID at 8:24 must be non-zero.
	var uuid [16]byte
	copy(uuid[:], data[8:24])
	if uuid == ([16]byte{}) {
		t.Error("uuid is all-zeros; expected a random value")
	}

	// ctime at 24:32 (LE int64) must be near now.
	ctime := int64(binary.LittleEndian.Uint64(data[24:32]))
	after := time.Now().Unix()
	if ctime < before-5 || ctime > after+5 {
		t.Errorf("ctime %d not near test time [%d, %d]", ctime, before, after)
	}

	// index_csum at 32:64 = SHA256(digest_0 || digest_1).
	expected := sha256.Sum256(append(digest0[:], digest1[:]...))
	var gotCsum [32]byte
	copy(gotCsum[:], data[32:64])
	if gotCsum != expected {
		t.Errorf("index_csum mismatch in file")
	}
	if csum != expected {
		t.Errorf("Close() returned csum != written csum")
	}

	// size at 64:72 (LE uint64).
	gotSize := binary.LittleEndian.Uint64(data[64:72])
	if gotSize != totalSize {
		t.Errorf("size: got %d, want %d", gotSize, totalSize)
	}

	// chunk_size at 72:80 (LE uint64).
	gotChunkSize := binary.LittleEndian.Uint64(data[72:80])
	if gotChunkSize != uint64(testChunkSize) {
		t.Errorf("chunk_size: got %d, want %d", gotChunkSize, testChunkSize)
	}

	// reserved 80:4096 must be all zeros.
	for i := 80; i < headerSize; i++ {
		if data[i] != 0 {
			t.Errorf("reserved byte at offset %d is non-zero (%d)", i, data[i])
			break
		}
	}

	// digest_0 at 4096:4128.
	var gotDigest0 [32]byte
	copy(gotDigest0[:], data[headerSize:headerSize+digestSize])
	if gotDigest0 != digest0 {
		t.Error("digest_0 mismatch")
	}

	// digest_1 at 4128:4160.
	var gotDigest1 [32]byte
	copy(gotDigest1[:], data[headerSize+digestSize:headerSize+2*digestSize])
	if gotDigest1 != digest1 {
		t.Error("digest_1 mismatch")
	}
}

func TestAddChunk_LastChunkSmaller_OK(t *testing.T) {
	dir := t.TempDir()
	totalSize := uint64(5 * 1024 * 1024) // 5 MiB: 1 full + 1 partial chunk
	w, err := Create(filepath.Join(dir, "test.fidx"), totalSize, testChunkSize)
	if err != nil {
		t.Fatal(err)
	}
	var d0, d1 [32]byte
	if err := w.AddChunk(uint64(testChunkSize), uint32(testChunkSize), d0); err != nil {
		t.Fatalf("full chunk: %v", err)
	}
	if err := w.AddChunk(totalSize, uint32(1024*1024), d1); err != nil { // 1 MiB last chunk
		t.Fatalf("small last chunk: %v", err)
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestAddChunk_NonLastChunkWrongSize_Rejected(t *testing.T) {
	dir := t.TempDir()
	totalSize := uint64(8 * 1024 * 1024)
	w, _ := Create(filepath.Join(dir, "test.fidx"), totalSize, testChunkSize)
	defer w.Drop()

	// Non-last chunk with size < chunk_size (misaligned pos → error).
	var d [32]byte
	err := w.AddChunk(uint64(3*1024*1024), uint32(3*1024*1024), d)
	if err == nil {
		t.Error("expected error for non-last chunk with wrong size")
	}
}

func TestAddChunk_OversizedChunk_Rejected(t *testing.T) {
	dir := t.TempDir()
	w, _ := Create(filepath.Join(dir, "test.fidx"), uint64(8*testChunkSize), testChunkSize)
	defer w.Drop()

	var d [32]byte
	err := w.AddChunk(uint64(testChunkSize)+1, uint32(testChunkSize)+1, d)
	if err == nil {
		t.Error("expected error for oversized chunk")
	}
}

func TestClose_IsIdempotentError(t *testing.T) {
	dir := t.TempDir()
	w, _ := Create(filepath.Join(dir, "test.fidx"), uint64(testChunkSize), testChunkSize)
	var d [32]byte
	_ = w.AddChunk(uint64(testChunkSize), uint32(testChunkSize), d)
	if _, err := w.Close(); err != nil {
		t.Fatalf("first close: %v", err)
	}
	if _, err := w.Close(); err == nil {
		t.Error("expected error on second Close, got nil")
	}
}

func TestDrop_RemovesTempFile(t *testing.T) {
	dir := t.TempDir()
	finalPath := filepath.Join(dir, "test.fidx")
	w, err := Create(finalPath, uint64(testChunkSize), testChunkSize)
	if err != nil {
		t.Fatal(err)
	}
	w.Drop()

	// Final path must not exist.
	if _, err := os.Stat(finalPath); err == nil {
		t.Error("final .fidx exists after Drop (should not)")
	}

	// No .tmp.* files should remain in dir.
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp.") {
			t.Errorf("temp file left after Drop: %s", e.Name())
		}
	}
}

func TestClose_AtomicRename(t *testing.T) {
	dir := t.TempDir()
	finalPath := filepath.Join(dir, "atomic.fidx")
	w, _ := Create(finalPath, uint64(testChunkSize), testChunkSize)
	var d [32]byte
	_ = w.AddChunk(uint64(testChunkSize), uint32(testChunkSize), d)
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}

	// Final file must exist.
	if _, err := os.Stat(finalPath); err != nil {
		t.Errorf("final .fidx not found after Close: %v", err)
	}

	// No temp files remain.
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp.") {
			t.Errorf("temp file left after Close: %s", e.Name())
		}
	}
}
