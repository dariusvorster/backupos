package gcsweep

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/chunkstore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"golang.org/x/sys/unix"
)

// makeStore creates a temp datastore with .chunks/<shard>/ layout.
func makeStore(t *testing.T) (store *chunkstore.Store, root string) {
	t.Helper()
	root = t.TempDir()
	chunkDir := filepath.Join(root, ".chunks")
	if err := os.MkdirAll(chunkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	s, err := chunkstore.New(root)
	if err != nil {
		t.Fatalf("chunkstore.New: %v", err)
	}
	return s, root
}

// writeChunk writes a fake chunk file and sets its atime to the given time.
func writeChunk(t *testing.T, root string, name string, atime time.Time) string {
	t.Helper()
	shard := name[:4]
	shardDir := filepath.Join(root, ".chunks", shard)
	if err := os.MkdirAll(shardDir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(shardDir, name)
	if err := os.WriteFile(p, []byte("chunkdata"), 0o644); err != nil {
		t.Fatal(err)
	}
	setAtime(t, p, atime)
	return p
}

func setAtime(t *testing.T, path string, atime time.Time) {
	t.Helper()
	times := []unix.Timespec{
		{Sec: atime.Unix(), Nsec: 0},
		{Sec: 0, Nsec: unix.UTIME_OMIT},
	}
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, path, times, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		t.Fatalf("setAtime: %v", err)
	}
}

const hexChunk = "abcd" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab"
const hexChunk2 = "ef01" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789ef"

func TestSweep_OldChunk_Removed(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)
	oldAtime := now.Add(-2 * time.Hour)

	path := writeChunk(t, root, hexChunk, oldAtime)
	status := &gcstatus.Status{}

	if err := Sweep(context.Background(), store, time.Time{}, minAtime, status); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected old chunk to be removed")
	}
	if status.RemovedChunks != 1 {
		t.Errorf("RemovedChunks: got %d, want 1", status.RemovedChunks)
	}
	if status.DiskChunks != 1 {
		t.Errorf("DiskChunks: got %d, want 1", status.DiskChunks)
	}
}

func TestSweep_RecentChunk_Kept(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)
	recentAtime := now.Add(-30 * time.Minute)

	path := writeChunk(t, root, hexChunk, recentAtime)
	status := &gcstatus.Status{}

	if err := Sweep(context.Background(), store, time.Time{}, minAtime, status); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected recent chunk to be kept, got: %v", err)
	}
	if status.RemovedChunks != 0 {
		t.Errorf("RemovedChunks: got %d, want 0", status.RemovedChunks)
	}
}

func TestSweep_PendingChunk_WithActiveWriter(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)
	oldestWriter := now.Add(-30 * time.Minute)
	// Chunk atime is between minAtime and oldestWriter → pending
	chunkAtime := now.Add(-45 * time.Minute)

	path := writeChunk(t, root, hexChunk, chunkAtime)
	status := &gcstatus.Status{}

	if err := Sweep(context.Background(), store, oldestWriter, minAtime, status); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected pending chunk to be kept, got: %v", err)
	}
	if status.PendingChunks != 1 {
		t.Errorf("PendingChunks: got %d, want 1", status.PendingChunks)
	}
	if status.RemovedChunks != 0 {
		t.Errorf("RemovedChunks: got %d, want 0", status.RemovedChunks)
	}
}

func TestSweep_OldestWriterExtendsMinAtime(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)
	// oldestWriter is before minAtime, so effectiveMin = oldestWriter - 5min
	oldestWriter := now.Add(-90 * time.Minute)
	effectiveMin := oldestWriter.Add(-OldestWriterSafety)

	// Chunk atime is between effectiveMin and minAtime → should be kept (pending)
	chunkAtime := effectiveMin.Add(1 * time.Minute)

	path := writeChunk(t, root, hexChunk, chunkAtime)
	status := &gcstatus.Status{}

	if err := Sweep(context.Background(), store, oldestWriter, minAtime, status); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected chunk to be kept (effectiveMin extended): %v", err)
	}
	if status.RemovedChunks != 0 {
		t.Errorf("RemovedChunks: got %d, want 0", status.RemovedChunks)
	}
}

func TestSweep_MultipleChunks_MixedDecisions(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)

	oldPath := writeChunk(t, root, hexChunk, now.Add(-2*time.Hour))
	recentPath := writeChunk(t, root, hexChunk2, now.Add(-30*time.Minute))
	status := &gcstatus.Status{}

	if err := Sweep(context.Background(), store, time.Time{}, minAtime, status); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("old chunk should be removed")
	}
	if _, err := os.Stat(recentPath); err != nil {
		t.Errorf("recent chunk should be kept: %v", err)
	}
	if status.RemovedChunks != 1 {
		t.Errorf("RemovedChunks: got %d, want 1", status.RemovedChunks)
	}
	if status.DiskChunks != 2 {
		t.Errorf("DiskChunks: got %d, want 2", status.DiskChunks)
	}
}

func TestSweep_ContextCancelled_StopsIteration(t *testing.T) {
	store, root := makeStore(t)
	now := time.Now()
	minAtime := now.Add(-1 * time.Hour)
	writeChunk(t, root, hexChunk, now.Add(-2*time.Hour))

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancel

	status := &gcstatus.Status{}
	err := Sweep(ctx, store, time.Time{}, minAtime, status)
	if err == nil {
		t.Error("expected error from cancelled context")
	}
}

func TestSweep_NoChunks_ReturnsNil(t *testing.T) {
	store, _ := makeStore(t)
	status := &gcstatus.Status{}
	if err := Sweep(context.Background(), store, time.Time{}, time.Now().Add(-time.Hour), status); err != nil {
		t.Errorf("Sweep on empty store: %v", err)
	}
	if status.DiskChunks != 0 {
		t.Errorf("DiskChunks: got %d, want 0", status.DiskChunks)
	}
}
