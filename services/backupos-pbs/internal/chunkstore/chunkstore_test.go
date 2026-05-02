package chunkstore

import (
	"context"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/unix"
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

func setChunkAtime(t *testing.T, path string, atime time.Time) {
	t.Helper()
	times := []unix.Timespec{
		{Sec: atime.Unix(), Nsec: 0},
		{Sec: 0, Nsec: unix.UTIME_OMIT},
	}
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, path, times, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		t.Fatalf("setChunkAtime: %v", err)
	}
}

func writeRawChunk(t *testing.T, root, name string) string {
	t.Helper()
	shard := name[:4]
	if err := os.MkdirAll(filepath.Join(root, ".chunks", shard), 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(root, ".chunks", shard, name)
	if err := os.WriteFile(p, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

const iterChunk1 = "abcd" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab"
const iterChunk2 = "ef01" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789ef"

func TestIterate_VisitsValidChunks(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}

	p1 := writeRawChunk(t, root, iterChunk1)
	p2 := writeRawChunk(t, root, iterChunk2)
	now := time.Now()
	setChunkAtime(t, p1, now.Add(-2*time.Hour))
	setChunkAtime(t, p2, now.Add(-30*time.Minute))

	seen := map[string]time.Time{}
	err = s.Iterate(context.Background(), func(digest [32]byte, path string, atime time.Time) error {
		seen[hex.EncodeToString(digest[:])] = atime
		return nil
	})
	if err != nil {
		t.Fatalf("Iterate: %v", err)
	}
	if len(seen) != 2 {
		t.Errorf("got %d chunks, want 2", len(seen))
	}
	if _, ok := seen[iterChunk1]; !ok {
		t.Errorf("iterChunk1 not visited")
	}
	if _, ok := seen[iterChunk2]; !ok {
		t.Errorf("iterChunk2 not visited")
	}
}

func TestIterate_SkipsNonHexFiles(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}

	// Write a valid chunk.
	writeRawChunk(t, root, iterChunk1)

	// Write a temp file that should be skipped.
	shardDir := filepath.Join(root, ".chunks", "abcd")
	if err := os.WriteFile(filepath.Join(shardDir, ".chunk.tmp.deadbeef"), []byte("tmp"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A shard dir with wrong length name.
	if err := os.MkdirAll(filepath.Join(root, ".chunks", "xyz"), 0o755); err != nil {
		t.Fatal(err)
	}

	count := 0
	if err := s.Iterate(context.Background(), func(_ [32]byte, _ string, _ time.Time) error {
		count++
		return nil
	}); err != nil {
		t.Fatalf("Iterate: %v", err)
	}
	if count != 1 {
		t.Errorf("got %d chunks, want 1 (non-hex entries must be skipped)", count)
	}
}

func TestIterate_CallbackError_Propagates(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	writeRawChunk(t, root, iterChunk1)

	sentinel := errors.New("stop")
	err = s.Iterate(context.Background(), func(_ [32]byte, _ string, _ time.Time) error {
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Errorf("expected sentinel error, got: %v", err)
	}
}

func TestIterate_ContextCancelled_Stops(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	writeRawChunk(t, root, iterChunk1)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err = s.Iterate(ctx, func(_ [32]byte, _ string, _ time.Time) error {
		return nil
	})
	if err == nil {
		t.Error("expected error from cancelled context")
	}
}

func TestLockMutex_UnlockReleases(t *testing.T) {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, ".chunks"), 0o755)
	s, _ := New(root)

	unlock := s.LockMutex()
	// A second goroutine should block until unlock is called.
	done := make(chan struct{})
	go func() {
		u2 := s.LockMutex()
		u2()
		close(done)
	}()

	// Give the goroutine a moment to try to acquire the lock.
	time.Sleep(10 * time.Millisecond)
	select {
	case <-done:
		t.Error("goroutine acquired lock before unlock was called")
	default:
	}

	unlock()
	select {
	case <-done:
		// correct: goroutine got the lock after unlock
	case <-time.After(time.Second):
		t.Error("goroutine did not acquire lock after unlock")
	}
}
