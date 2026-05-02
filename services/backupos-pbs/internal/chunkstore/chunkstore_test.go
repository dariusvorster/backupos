package chunkstore

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// setupStore creates a temp datastore root with a .chunks dir and a subset
// of shard dirs needed for the digests used in each test.
func setupStore(t *testing.T, digests ...[32]byte) (string, *Store) {
	t.Helper()
	root := t.TempDir()
	chunkDir := filepath.Join(root, ".chunks")
	if err := os.MkdirAll(chunkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, d := range digests {
		prefix := hex.EncodeToString(d[:])[:4]
		if err := os.MkdirAll(filepath.Join(chunkDir, prefix), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	return root, s
}

func TestPath_Sharding(t *testing.T) {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, ".chunks"), 0o755)
	s, _ := New(root)

	var digest [32]byte
	digest[0] = 0x0a
	digest[1] = 0x1b
	digest[2] = 0x2c

	got := s.Path(digest)
	hexDigest := hex.EncodeToString(digest[:])
	want := filepath.Join(root, ".chunks", "0a1b", hexDigest)
	if got != want {
		t.Errorf("Path: got %s, want %s", got, want)
	}
}

func TestInsert_NewChunk_WritesFile(t *testing.T) {
	var digest [32]byte
	digest[0] = 0xde
	digest[1] = 0xad
	_, s := setupStore(t, digest)

	raw := []byte("chunk data payload")
	isDup, size, err := s.Insert(digest, raw)
	if err != nil {
		t.Fatal(err)
	}
	if isDup {
		t.Error("expected isDuplicate=false for new chunk")
	}
	if size != uint64(len(raw)) {
		t.Errorf("size: got %d, want %d", size, len(raw))
	}

	// Verify file exists on disk with correct contents.
	path := s.Path(digest)
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read chunk: %v", err)
	}
	if string(got) != string(raw) {
		t.Error("chunk contents mismatch")
	}
}

func TestInsert_DuplicateSameSize_ReturnsDuplicate(t *testing.T) {
	var digest [32]byte
	digest[0] = 0xca
	digest[1] = 0xfe
	_, s := setupStore(t, digest)

	raw := []byte("same chunk")
	_, _, _ = s.Insert(digest, raw)

	isDup, size, err := s.Insert(digest, raw)
	if err != nil {
		t.Fatal(err)
	}
	if !isDup {
		t.Error("expected isDuplicate=true for same-size re-insert")
	}
	if size != uint64(len(raw)) {
		t.Errorf("size: got %d, want %d", size, len(raw))
	}
}

func TestInsert_SizeMismatch_KeepsExisting(t *testing.T) {
	var digest [32]byte
	digest[0] = 0xba
	digest[1] = 0xbe
	_, s := setupStore(t, digest)

	original := []byte("original chunk data")
	larger := []byte("longer chunk data with more bytes here")
	_, _, _ = s.Insert(digest, original)

	// Inserting different-size data for same digest: existing kept, isDuplicate=true.
	isDup, existingSize, err := s.Insert(digest, larger)
	if err != nil {
		t.Fatal(err)
	}
	if !isDup {
		t.Error("expected isDuplicate=true on size mismatch (keep existing)")
	}
	if existingSize != uint64(len(original)) {
		t.Errorf("returned existingSize: got %d, want %d", existingSize, len(original))
	}

	// File on disk should still have the original content.
	path := s.Path(digest)
	got, _ := os.ReadFile(path)
	if string(got) != string(original) {
		t.Error("existing chunk was overwritten on size mismatch (should keep existing)")
	}
}

func TestInsert_AtomicWrite_NoTmpFilesRemain(t *testing.T) {
	var digest [32]byte
	digest[0] = 0xfe
	digest[1] = 0xed
	root, s := setupStore(t, digest)

	raw := []byte("atomic test")
	_, _, err := s.Insert(digest, raw)
	if err != nil {
		t.Fatal(err)
	}

	// Verify no .tmp.* files remain in the shard dir.
	prefix := hex.EncodeToString(digest[:])[:4]
	shardDir := filepath.Join(root, ".chunks", prefix)
	entries, _ := os.ReadDir(shardDir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp.") {
			t.Errorf("temp file left behind: %s", e.Name())
		}
	}
}

func TestNew_MissingChunksDir_ReturnsError(t *testing.T) {
	root := t.TempDir()
	// Do NOT create .chunks dir.
	_, err := New(root)
	if err == nil {
		t.Error("expected error when .chunks dir missing, got nil")
	}
}
