package didx

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"testing"
)

// makeDidxBuf builds an in-memory .didx file with the given (end, digest) pairs.
// Returns the buffer and the computed index_csum.
func makeDidxBuf(entries []ChunkRef) ([]byte, [32]byte) {
	// Compute index_csum over (end_le || digest) pairs.
	h := sha256.New()
	for _, e := range entries {
		var end [8]byte
		binary.LittleEndian.PutUint64(end[:], e.End)
		h.Write(end[:])
		h.Write(e.Digest[:])
	}
	var csum [32]byte
	copy(csum[:], h.Sum(nil))

	hdr := make([]byte, headerSize)
	copy(hdr[0:8], Magic[:])
	copy(hdr[32:64], csum[:])

	body := make([]byte, len(entries)*entrySize)
	for i, e := range entries {
		binary.LittleEndian.PutUint64(body[i*entrySize:], e.End)
		copy(body[i*entrySize+8:], e.Digest[:])
	}
	return append(hdr, body...), csum
}

func TestReadHeader_ValidMagic_Succeeds(t *testing.T) {
	buf, _ := makeDidxBuf(nil)
	_, err := ReadHeader(bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReadHeader_InvalidMagic_ReturnsError(t *testing.T) {
	buf, _ := makeDidxBuf(nil)
	buf[0] = 0xFF // corrupt magic
	_, err := ReadHeader(bytes.NewReader(buf))
	if err == nil {
		t.Fatal("expected error for invalid magic, got nil")
	}
}

func TestReadHeader_TooShort_ReturnsError(t *testing.T) {
	_, err := ReadHeader(bytes.NewReader(make([]byte, 100)))
	if err == nil {
		t.Fatal("expected error for short header, got nil")
	}
}

func TestReadHeader_ParsesCsum(t *testing.T) {
	entries := []ChunkRef{
		{End: 1048576, Digest: [32]byte{0: 0xAA}},
	}
	buf, wantCsum := makeDidxBuf(entries)
	h, err := ReadHeader(bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.IndexCsum != wantCsum {
		t.Errorf("csum mismatch: got %x, want %x", h.IndexCsum, wantCsum)
	}
}

func TestReadEntries_EmptyAfterHeader_ReturnsEmptySlice(t *testing.T) {
	buf, _ := makeDidxBuf(nil)
	r := bytes.NewReader(buf)
	if _, err := ReadHeader(r); err != nil {
		t.Fatal(err)
	}
	entries, err := ReadEntries(r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestReadEntries_ParsesEntries(t *testing.T) {
	want := []ChunkRef{
		{End: 1048576, Digest: [32]byte{0: 0x11}},
		{End: 3145728, Digest: [32]byte{0: 0x22}},
		{End: 7340032, Digest: [32]byte{0: 0x33}},
	}
	buf, _ := makeDidxBuf(want)
	r := bytes.NewReader(buf)
	if _, err := ReadHeader(r); err != nil {
		t.Fatal(err)
	}
	got, err := ReadEntries(r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("entry count: got %d, want %d", len(got), len(want))
	}
	for i, g := range got {
		if g.End != want[i].End {
			t.Errorf("entry[%d].End: got %d, want %d", i, g.End, want[i].End)
		}
		if g.Digest != want[i].Digest {
			t.Errorf("entry[%d].Digest mismatch", i)
		}
	}
}

func TestReadEntries_NonMonotonicEnd_ReturnsError(t *testing.T) {
	// Build entries with a non-monotonic end manually (bypass makeDidxBuf validation).
	entries := []ChunkRef{
		{End: 2097152, Digest: [32]byte{0: 0x01}},
		{End: 1048576, Digest: [32]byte{0: 0x02}}, // end goes backwards
	}
	buf, _ := makeDidxBuf(entries)
	// Patch entry[1].end to be smaller than entry[0].end in the raw bytes.
	// makeDidxBuf writes them as-is; ReadEntries must reject the sequence.
	r := bytes.NewReader(buf)
	if _, err := ReadHeader(r); err != nil {
		t.Fatal(err)
	}
	_, err := ReadEntries(r)
	if err == nil {
		t.Fatal("expected error for non-monotonic end_le, got nil")
	}
}

func TestReadEntries_ChunkTooLarge_ReturnsError(t *testing.T) {
	const sixtyFiveMiB = 65 * 1024 * 1024
	entries := []ChunkRef{
		{End: sixtyFiveMiB, Digest: [32]byte{0: 0x01}},
	}
	buf, _ := makeDidxBuf(entries)
	r := bytes.NewReader(buf)
	if _, err := ReadHeader(r); err != nil {
		t.Fatal(err)
	}
	_, err := ReadEntries(r)
	if err == nil {
		t.Fatal("expected error for chunk > 64 MiB, got nil")
	}
}

func TestReadEntries_TruncatedEntry_ReturnsError(t *testing.T) {
	buf, _ := makeDidxBuf(nil)
	// Append 24 bytes (less than entrySize=40) to simulate a truncated entry.
	buf = append(buf, make([]byte, 24)...)
	r := bytes.NewReader(buf)
	if _, err := ReadHeader(r); err != nil {
		t.Fatal(err)
	}
	_, err := ReadEntries(r)
	if err == nil {
		t.Fatal("expected error for truncated entry, got nil")
	}
}
