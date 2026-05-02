package indexread

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
)

func writeMagic(t *testing.T, dir string, magic [8]byte) string {
	t.Helper()
	p := filepath.Join(dir, "test.idx")
	if err := os.WriteFile(p, magic[:], 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDetectType_Fidx(t *testing.T) {
	tmp := t.TempDir()
	p := writeMagic(t, tmp, MagicFidx)
	got, err := DetectType(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != IndexFixed {
		t.Errorf("expected IndexFixed, got %v", got)
	}
}

func TestDetectType_Didx(t *testing.T) {
	tmp := t.TempDir()
	p := writeMagic(t, tmp, MagicDidx)
	got, err := DetectType(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != IndexDynamic {
		t.Errorf("expected IndexDynamic, got %v", got)
	}
}

func TestDetectType_Unknown(t *testing.T) {
	tmp := t.TempDir()
	p := writeMagic(t, tmp, [8]byte{0xDE, 0xAD, 0xBE, 0xEF, 0, 0, 0, 0})
	got, err := DetectType(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != IndexUnknown {
		t.Errorf("expected IndexUnknown, got %v", got)
	}
}

func TestDetectType_FileTooShort(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "short.idx")
	if err := os.WriteFile(p, []byte{0x01, 0x02}, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := DetectType(p)
	if err == nil {
		t.Error("expected error for file too short to read magic, got nil")
	}
}

func TestEnumerateDigests_FidxRoundtrip(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "test.fidx")
	const chunkSize = 4096
	const numChunks = 3

	w, err := fidx.Create(path, chunkSize*numChunks, chunkSize)
	if err != nil {
		t.Fatal(err)
	}

	want := [][32]byte{
		{0: 0x11, 1: 0x22},
		{0: 0x33, 1: 0x44},
		{0: 0x55, 1: 0x66},
	}
	for i, d := range want {
		offset := uint64((i + 1) * chunkSize)
		if err := w.AddChunk(offset, chunkSize, d); err != nil {
			t.Fatalf("AddChunk %d: %v", i, err)
		}
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}

	got, err := EnumerateDigests(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("got %d digests, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("digest[%d]: got %x, want %x", i, got[i], want[i])
		}
	}
}

func TestEnumerateDigests_DidxRoundtrip(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "test.didx")

	w, err := didx.Create(path)
	if err != nil {
		t.Fatal(err)
	}

	want := [][32]byte{
		{0: 0xAA, 1: 0xBB},
		{0: 0xCC, 1: 0xDD},
	}
	offsets := []uint64{1024, 2048}
	for i, d := range want {
		if err := w.AddChunk(offsets[i], d); err != nil {
			t.Fatalf("AddChunk %d: %v", i, err)
		}
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}

	got, err := EnumerateDigests(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("got %d digests, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("digest[%d]: got %x, want %x", i, got[i], want[i])
		}
	}
}

func TestEnumerateDigests_BadAlignment_Fidx(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "bad.fidx")
	// header (4096) + 31 bytes — not divisible by 32
	data := make([]byte, headerSize+31)
	copy(data, MagicFidx[:])
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := EnumerateDigests(p)
	if err == nil {
		t.Error("expected error for bad fidx body alignment, got nil")
	}
}

func TestEnumerateDigests_BadAlignment_Didx(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "bad.didx")
	// header (4096) + 39 bytes — not divisible by 40
	data := make([]byte, headerSize+39)
	copy(data, MagicDidx[:])
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := EnumerateDigests(p)
	if err == nil {
		t.Error("expected error for bad didx body alignment, got nil")
	}
}

func TestEnumerateDigests_NotAnIndex(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "blob.blob")
	data := make([]byte, headerSize+32)
	data[0] = 0xDE
	data[1] = 0xAD
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := EnumerateDigests(p)
	if err == nil {
		t.Error("expected error for non-index file, got nil")
	}
}
