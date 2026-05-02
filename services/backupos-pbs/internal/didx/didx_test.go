package didx

import (
	"crypto/sha256"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

func TestCreate_WritesCorrectMagic(t *testing.T) {
	dir := t.TempDir()
	w, err := Create(filepath.Join(dir, "test.didx"))
	if err != nil {
		t.Fatal(err)
	}
	w.Drop()

	// tmp file should be gone after Drop
	if _, err := os.Stat(filepath.Join(dir, "test.didx.tmp")); !os.IsNotExist(err) {
		t.Error("tmp file still exists after Drop")
	}
}

func TestAddChunk_AndClose_ByteExact(t *testing.T) {
	dir := t.TempDir()
	finalPath := filepath.Join(dir, "out.didx")
	w, err := Create(finalPath)
	if err != nil {
		t.Fatal(err)
	}

	var digest1 [32]byte
	for i := range digest1 {
		digest1[i] = byte(i + 1)
	}
	var digest2 [32]byte
	for i := range digest2 {
		digest2[i] = byte(i + 0x80)
	}

	offset1 := uint64(65536)
	offset2 := uint64(131072)

	if err := w.AddChunk(offset1, digest1); err != nil {
		t.Fatal(err)
	}
	if err := w.AddChunk(offset2, digest2); err != nil {
		t.Fatal(err)
	}

	gotCsum, err := w.Close()
	if err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Compute expected index_csum manually.
	h := sha256.New()
	var e1, e2 [40]byte
	binary.LittleEndian.PutUint64(e1[0:8], offset1)
	copy(e1[8:], digest1[:])
	binary.LittleEndian.PutUint64(e2[0:8], offset2)
	copy(e2[8:], digest2[:])
	h.Write(e1[:])
	h.Write(e2[:])
	var wantCsum [32]byte
	copy(wantCsum[:], h.Sum(nil))

	if gotCsum != wantCsum {
		t.Errorf("csum mismatch:\n  got  %x\n  want %x", gotCsum, wantCsum)
	}

	// Read the final file and verify byte layout.
	raw, err := os.ReadFile(finalPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != headerSize+2*40 {
		t.Fatalf("file size: got %d, want %d", len(raw), headerSize+2*40)
	}

	// Magic at [0:8]
	if [8]byte(raw[0:8]) != Magic {
		t.Errorf("magic mismatch: got %v", raw[0:8])
	}

	// index_csum at [32:64]
	var fileCsum [32]byte
	copy(fileCsum[:], raw[32:64])
	if fileCsum != wantCsum {
		t.Errorf("on-disk csum mismatch")
	}

	// First entry at [4096:4136]
	off1 := binary.LittleEndian.Uint64(raw[4096:4104])
	if off1 != offset1 {
		t.Errorf("entry[0] offset: got %d, want %d", off1, offset1)
	}
	var d1 [32]byte
	copy(d1[:], raw[4104:4136])
	if d1 != digest1 {
		t.Errorf("entry[0] digest mismatch")
	}

	// Second entry at [4136:4176]
	off2 := binary.LittleEndian.Uint64(raw[4136:4144])
	if off2 != offset2 {
		t.Errorf("entry[1] offset: got %d, want %d", off2, offset2)
	}
	var d2 [32]byte
	copy(d2[:], raw[4144:4176])
	if d2 != digest2 {
		t.Errorf("entry[1] digest mismatch")
	}
}

func TestIndexLength_TracksChunkCount(t *testing.T) {
	dir := t.TempDir()
	w, err := Create(filepath.Join(dir, "test.didx"))
	if err != nil {
		t.Fatal(err)
	}
	defer w.Drop()

	if w.IndexLength() != 0 {
		t.Errorf("initial IndexLength: got %d, want 0", w.IndexLength())
	}
	var d [32]byte
	_ = w.AddChunk(1000, d)
	if w.IndexLength() != 1 {
		t.Errorf("after one chunk: got %d, want 1", w.IndexLength())
	}
}

func TestClose_TmpFileGoneOnSuccess(t *testing.T) {
	dir := t.TempDir()
	finalPath := filepath.Join(dir, "out.didx")
	w, err := Create(finalPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(finalPath + ".tmp"); !os.IsNotExist(err) {
		t.Error("tmp file still present after successful Close")
	}
	if _, err := os.Stat(finalPath); err != nil {
		t.Errorf("final file missing: %v", err)
	}
}

func TestDrop_AfterClose_IsNoop(t *testing.T) {
	dir := t.TempDir()
	finalPath := filepath.Join(dir, "out.didx")
	w, err := Create(finalPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}
	w.Drop() // must not panic or delete the final file
	if _, err := os.Stat(finalPath); err != nil {
		t.Errorf("final file deleted by Drop after Close: %v", err)
	}
}

func TestAddChunk_AfterClose_ReturnsError(t *testing.T) {
	dir := t.TempDir()
	w, err := Create(filepath.Join(dir, "test.didx"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}
	var d [32]byte
	if err := w.AddChunk(100, d); err == nil {
		t.Error("expected error adding chunk after Close, got nil")
	}
}
