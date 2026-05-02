package incremental

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

const chunkSize = 4 * 1024 * 1024

// buildFidx creates a .fidx file at path with the given digests and returns its
// index_csum. Uses a consistent known size so the file is valid.
func buildFidx(t *testing.T, path string, digests [][32]byte) [32]byte {
	t.Helper()
	totalSize := uint64(len(digests)) * chunkSize
	if totalSize == 0 {
		totalSize = chunkSize // at least one slot
	}
	w, err := fidx.Create(path, totalSize, chunkSize)
	if err != nil {
		t.Fatal(err)
	}
	for i, d := range digests {
		offset := uint64((i + 1)) * chunkSize
		if err := w.AddChunk(offset, chunkSize, d); err != nil {
			t.Fatal(err)
		}
	}
	csum, err := w.Close()
	if err != nil {
		t.Fatal(err)
	}
	return csum
}

func TestRegister_Success(t *testing.T) {
	dir := t.TempDir()
	digests := [][32]byte{{0: 0x11}, {0: 0x22}, {0: 0x33}}
	path := filepath.Join(dir, "drive-0.img.fidx")
	csum := buildFidx(t, path, digests)

	s := wstate.New()
	n, err := RegisterFromPreviousIndex(s, path, csum)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != len(digests) {
		t.Errorf("registered %d chunks, want %d", n, len(digests))
	}
}

func TestRegister_CsumMismatch_ReturnsErr(t *testing.T) {
	dir := t.TempDir()
	digests := [][32]byte{{0: 0xAA}}
	path := filepath.Join(dir, "drive-0.img.fidx")
	buildFidx(t, path, digests)

	var wrongCsum [32]byte
	wrongCsum[0] = 0xFF

	s := wstate.New()
	_, err := RegisterFromPreviousIndex(s, path, wrongCsum)
	if !errors.Is(err, ErrCsumMismatch) {
		t.Errorf("expected ErrCsumMismatch, got %v", err)
	}
}

func TestRegister_FileMissing_ReturnsErr(t *testing.T) {
	s := wstate.New()
	_, err := RegisterFromPreviousIndex(s, "/no/such/file.fidx", [32]byte{})
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected os.ErrNotExist (wrapped), got %v", err)
	}
}

func TestRegister_PopulatesKnownChunks(t *testing.T) {
	dir := t.TempDir()
	d1 := [32]byte{0: 0xBB}
	d2 := [32]byte{0: 0xCC}
	path := filepath.Join(dir, "drive-0.img.fidx")
	csum := buildFidx(t, path, [][32]byte{d1, d2})

	s := wstate.New()
	if _, err := RegisterFromPreviousIndex(s, path, csum); err != nil {
		t.Fatal(err)
	}

	// Both digests should now be known.
	for _, d := range [][32]byte{d1, d2} {
		if size, ok := s.LookupChunk(d); !ok {
			t.Errorf("digest %x not in knownChunks after Register", d[:2])
		} else if size != chunkSize {
			t.Errorf("digest %x: size=%d, want %d", d[:2], size, chunkSize)
		}
	}
}
