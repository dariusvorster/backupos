package gcmark

import (
	"context"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fidx"
)

const (
	snapshotSubdir = "vm/100/2024-12-24T00:26:40Z"
)

// setupDatastore creates a minimal datastore directory structure with a .chunks dir.
func setupDatastore(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

// makeSnapDir creates a snapshot directory inside the datastore.
func makeSnapDir(t *testing.T, root string) string {
	t.Helper()
	p := filepath.Join(root, snapshotSubdir)
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

// writeChunk writes a chunk file at the correct sharded path and optionally sets its atime to old.
func writeChunk(t *testing.T, root string, digest [32]byte, setOldAtime bool) string {
	t.Helper()
	h := hex.EncodeToString(digest[:])
	dir := filepath.Join(root, ".chunks", h[:4])
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, h)
	if err := os.WriteFile(p, []byte("chunkdata"), 0o644); err != nil {
		t.Fatal(err)
	}
	if setOldAtime {
		old := time.Now().Add(-2 * time.Hour)
		times := []unix.Timespec{
			{Sec: old.Unix(), Nsec: 0},
			{Sec: 0, Nsec: unix.UTIME_OMIT},
		}
		if err := unix.UtimesNanoAt(unix.AT_FDCWD, p, times, unix.AT_SYMLINK_NOFOLLOW); err != nil {
			t.Fatalf("set old atime on chunk: %v", err)
		}
	}
	return p
}

// recentAtime returns true if path's atime is within the last 5 seconds.
func recentAtime(t *testing.T, path string) bool {
	t.Helper()
	var st unix.Stat_t
	if err := unix.Stat(path, &st); err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	return time.Now().Unix()-st.Atim.Sec < 5
}

func TestMark_EmptyDatastore(t *testing.T) {
	root := setupDatastore(t)
	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark: %v", err)
	}
	if stats.SnapshotsProcessed != 0 {
		t.Errorf("snapshots: got %d, want 0", stats.SnapshotsProcessed)
	}
	if stats.IndexFilesProcessed != 0 {
		t.Errorf("index files: got %d, want 0", stats.IndexFilesProcessed)
	}
	if stats.DigestsTouched != 0 {
		t.Errorf("digests touched: got %d, want 0", stats.DigestsTouched)
	}
	if len(stats.Errors) != 0 {
		t.Errorf("errors: got %v", stats.Errors)
	}
}

func TestMark_OneSnapshotOneFidx(t *testing.T) {
	root := setupDatastore(t)
	snapDir := makeSnapDir(t, root)

	digests := [][32]byte{{0: 0x11}, {0: 0x22}, {0: 0x33}}
	const chunkSize = 4096
	idxPath := filepath.Join(snapDir, "drive-0.img.fidx")

	w, err := fidx.Create(idxPath, chunkSize*3, chunkSize)
	if err != nil {
		t.Fatal(err)
	}
	for i, d := range digests {
		if err := w.AddChunk(uint64((i+1)*chunkSize), chunkSize, d); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}

	// Write chunks with old atimes.
	var chunkPaths []string
	for _, d := range digests {
		chunkPaths = append(chunkPaths, writeChunk(t, root, d, true))
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark: %v", err)
	}
	if len(stats.Errors) != 0 {
		t.Errorf("unexpected errors: %v", stats.Errors)
	}
	if stats.IndexFilesProcessed != 1 {
		t.Errorf("index files: got %d, want 1", stats.IndexFilesProcessed)
	}
	if stats.DigestsTouched != int64(len(digests)) {
		t.Errorf("digests touched: got %d, want %d", stats.DigestsTouched, len(digests))
	}
	if stats.SnapshotsProcessed != 1 {
		t.Errorf("snapshots: got %d, want 1", stats.SnapshotsProcessed)
	}

	// Verify each chunk's atime was advanced.
	for _, p := range chunkPaths {
		if !recentAtime(t, p) {
			t.Errorf("chunk %s: atime not advanced by Mark", p)
		}
	}
}

func TestMark_OneSnapshotOneDidx(t *testing.T) {
	root := setupDatastore(t)
	snapDir := makeSnapDir(t, root)

	digests := [][32]byte{{0: 0xAA}, {0: 0xBB}}
	idxPath := filepath.Join(snapDir, "archive.pxar.didx")

	dw, err := didx.Create(idxPath)
	if err != nil {
		t.Fatal(err)
	}
	for i, d := range digests {
		if err := dw.AddChunk(uint64((i+1)*1024), d); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := dw.Close(); err != nil {
		t.Fatal(err)
	}

	var chunkPaths []string
	for _, d := range digests {
		chunkPaths = append(chunkPaths, writeChunk(t, root, d, true))
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark: %v", err)
	}
	if len(stats.Errors) != 0 {
		t.Errorf("unexpected errors: %v", stats.Errors)
	}
	if stats.DigestsTouched != int64(len(digests)) {
		t.Errorf("digests touched: got %d, want %d", stats.DigestsTouched, len(digests))
	}
	for _, p := range chunkPaths {
		if !recentAtime(t, p) {
			t.Errorf("chunk %s: atime not advanced", p)
		}
	}
}

func TestMark_SnapshotWithBlobOnly(t *testing.T) {
	root := setupDatastore(t)
	snapDir := makeSnapDir(t, root)

	// Only a .blob file — no .fidx or .didx. No chunks should be touched.
	if err := os.WriteFile(filepath.Join(snapDir, "manifest.json.blob"), []byte("manifest"), 0o644); err != nil {
		t.Fatal(err)
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark: %v", err)
	}
	if stats.IndexFilesProcessed != 0 {
		t.Errorf("index files: got %d, want 0 (blob files must be skipped)", stats.IndexFilesProcessed)
	}
	if stats.DigestsTouched != 0 {
		t.Errorf("digests: got %d, want 0", stats.DigestsTouched)
	}
}

func TestMark_MissingChunk_DoesNotAbort(t *testing.T) {
	root := setupDatastore(t)
	snapDir := makeSnapDir(t, root)

	// .fidx references a digest but the chunk file doesn't exist.
	d := [32]byte{0: 0xCC}
	const chunkSize = 4096
	idxPath := filepath.Join(snapDir, "drive-0.img.fidx")
	w, err := fidx.Create(idxPath, chunkSize, chunkSize)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.AddChunk(chunkSize, chunkSize, d); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Close(); err != nil {
		t.Fatal(err)
	}
	// Chunk shard dir exists but chunk file does not.
	h := hex.EncodeToString(d[:])
	if err := os.MkdirAll(filepath.Join(root, ".chunks", h[:4]), 0o755); err != nil {
		t.Fatal(err)
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark must not abort on missing chunk: %v", err)
	}
	// TouchChunk returns nil for ENOENT — missing chunk is not an error.
	if len(stats.Errors) != 0 {
		t.Errorf("unexpected errors: %v", stats.Errors)
	}
	// DigestsTouched counts successful touches; missing chunk = 0 touches.
	if stats.DigestsTouched != 0 {
		t.Errorf("expected 0 touches for missing chunk, got %d", stats.DigestsTouched)
	}
}

func TestMark_CorruptIndex_AccumulatesError(t *testing.T) {
	root := setupDatastore(t)
	snapDir := makeSnapDir(t, root)

	// Write a file ending in .fidx but with garbage content.
	bad := filepath.Join(snapDir, "bad.fidx")
	if err := os.WriteFile(bad, []byte("this is not a valid fidx file"), 0o644); err != nil {
		t.Fatal(err)
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark must not abort on corrupt index: %v", err)
	}
	if len(stats.Errors) == 0 {
		t.Error("expected at least one error for corrupt index, got none")
	}
}

func TestMark_CtxCancelled(t *testing.T) {
	root := setupDatastore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := Mark(ctx, root)
	if err == nil {
		t.Error("expected error for cancelled context, got nil")
	}
}

func TestMark_SkipsChunkStore(t *testing.T) {
	root := setupDatastore(t)

	// Place a .fidx-named file inside .chunks/ — Mark must not enumerate it.
	chunkSubdir := filepath.Join(root, ".chunks", "abcd")
	if err := os.MkdirAll(chunkSubdir, 0o755); err != nil {
		t.Fatal(err)
	}
	fakeIdx := filepath.Join(chunkSubdir, "fake.fidx")
	// Write valid-looking fidx magic so enumeration would succeed if reached.
	data := make([]byte, 4096)
	copy(data, []byte{47, 127, 65, 237, 145, 253, 15, 205})
	if err := os.WriteFile(fakeIdx, data, 0o644); err != nil {
		t.Fatal(err)
	}

	stats, err := Mark(context.Background(), root)
	if err != nil {
		t.Fatalf("Mark: %v", err)
	}
	if stats.IndexFilesProcessed != 0 {
		t.Errorf("expected 0 index files (chunk store must be skipped), got %d", stats.IndexFilesProcessed)
	}
	if len(stats.Errors) != 0 {
		t.Errorf("unexpected errors: %v", stats.Errors)
	}
}
