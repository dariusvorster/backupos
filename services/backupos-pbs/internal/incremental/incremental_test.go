package incremental

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
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

// buildDidxFile creates a .didx file at path with the given entries and returns
// the index_csum (SHA256 over (end_le || digest) pairs).
func buildDidxFile(t *testing.T, path string, entries []didx.ChunkRef) [32]byte {
	t.Helper()
	h := sha256.New()
	for _, e := range entries {
		var end [8]byte
		binary.LittleEndian.PutUint64(end[:], e.End)
		h.Write(end[:])
		h.Write(e.Digest[:])
	}
	var csum [32]byte
	copy(csum[:], h.Sum(nil))

	hdr := make([]byte, 4096)
	copy(hdr[0:8], didx.Magic[:])
	copy(hdr[32:64], csum[:])

	body := make([]byte, len(entries)*40)
	for i, e := range entries {
		binary.LittleEndian.PutUint64(body[i*40:], e.End)
		copy(body[i*40+8:], e.Digest[:])
	}

	data := append(hdr, body...)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return csum
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

func TestRegisterDynamic_Success(t *testing.T) {
	dir := t.TempDir()
	entries := []didx.ChunkRef{
		{End: 1048576, Digest: [32]byte{0: 0x11}},
		{End: 3145728, Digest: [32]byte{0: 0x22}},
		{End: 7340032, Digest: [32]byte{0: 0x33}},
	}
	path := filepath.Join(dir, "pxar.didx")
	csum := buildDidxFile(t, path, entries)

	s := wstate.New()
	n, err := RegisterFromPreviousDynamicIndex(s, path, csum)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != len(entries) {
		t.Errorf("registered %d chunks, want %d", n, len(entries))
	}
}

func TestRegisterDynamic_CsumMismatch_ReturnsErr(t *testing.T) {
	dir := t.TempDir()
	entries := []didx.ChunkRef{{End: 1048576, Digest: [32]byte{0: 0xAA}}}
	path := filepath.Join(dir, "pxar.didx")
	buildDidxFile(t, path, entries)

	var wrongCsum [32]byte
	wrongCsum[0] = 0xFF

	s := wstate.New()
	_, err := RegisterFromPreviousDynamicIndex(s, path, wrongCsum)
	if !errors.Is(err, ErrCsumMismatch) {
		t.Errorf("expected ErrCsumMismatch, got %v", err)
	}
}

func TestRegisterDynamic_FileMissing_ReturnsErr(t *testing.T) {
	s := wstate.New()
	_, err := RegisterFromPreviousDynamicIndex(s, "/no/such/file.didx", [32]byte{})
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected os.ErrNotExist (wrapped), got %v", err)
	}
}

func TestRegisterDynamic_PopulatesKnownChunksWithCorrectSizes(t *testing.T) {
	dir := t.TempDir()
	entries := []didx.ChunkRef{
		{End: 1048576, Digest: [32]byte{0: 0xAA}}, // size = 1048576
		{End: 3145728, Digest: [32]byte{0: 0xBB}}, // size = 2097152
		{End: 7340032, Digest: [32]byte{0: 0xCC}}, // size = 4194304
	}
	path := filepath.Join(dir, "pxar.didx")
	csum := buildDidxFile(t, path, entries)

	s := wstate.New()
	if _, err := RegisterFromPreviousDynamicIndex(s, path, csum); err != nil {
		t.Fatal(err)
	}

	wantSizes := []uint32{1048576, 2097152, 4194304}
	for i, e := range entries {
		size, ok := s.LookupChunk(e.Digest)
		if !ok {
			t.Errorf("entry[%d] digest not in knownChunks", i)
			continue
		}
		if size != wantSizes[i] {
			t.Errorf("entry[%d] size: got %d, want %d", i, size, wantSizes[i])
		}
	}
}

func TestRegisterDynamic_FirstChunkSize(t *testing.T) {
	dir := t.TempDir()
	d := [32]byte{0: 0xDD}
	entries := []didx.ChunkRef{{End: 4194304, Digest: d}}
	path := filepath.Join(dir, "pxar.didx")
	csum := buildDidxFile(t, path, entries)

	s := wstate.New()
	if _, err := RegisterFromPreviousDynamicIndex(s, path, csum); err != nil {
		t.Fatal(err)
	}
	size, ok := s.LookupChunk(d)
	if !ok {
		t.Fatal("digest not in knownChunks")
	}
	if size != 4194304 {
		t.Errorf("first chunk size: got %d, want 4194304", size)
	}
}
