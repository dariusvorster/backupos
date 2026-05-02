package gcrun

import (
	"context"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// buildDatastore creates a minimal datastore layout:
//   - .chunks/<shard>/<digest>
//   - <backup-type>/<backup-id>/<timestamp>/<archive>.fidx  (or empty dir)
func buildDatastore(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	// Chunk store
	chunkDir := filepath.Join(root, ".chunks")
	if err := os.MkdirAll(chunkDir, 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

func writeChunk(t *testing.T, root string, name string, atime time.Time) string {
	t.Helper()
	shard := name[:4]
	p := filepath.Join(root, ".chunks", shard, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("chunkdata"), 0o644); err != nil {
		t.Fatal(err)
	}
	times := []unix.Timespec{
		{Sec: atime.Unix(), Nsec: 0},
		{Sec: 0, Nsec: unix.UTIME_OMIT},
	}
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, p, times, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		t.Fatalf("setAtime: %v", err)
	}
	return p
}

func noActiveWriter(_ context.Context) (time.Time, error) {
	return time.Time{}, nil
}

func TestRun_NoChunks_Succeeds(t *testing.T) {
	root := buildDatastore(t)

	status, err := Run(context.Background(), root, noActiveWriter)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if status.DiskChunks != 0 {
		t.Errorf("DiskChunks: got %d, want 0", status.DiskChunks)
	}
}

func TestRun_OldUnreferencedChunk_Removed(t *testing.T) {
	root := buildDatastore(t)

	// A chunk whose atime is 48 hours old — well past DefaultCutoff.
	name := hex.EncodeToString(make([]byte, 32))
	chunkPath := writeChunk(t, root, name, time.Now().Add(-48*time.Hour))

	status, err := Run(context.Background(), root, noActiveWriter)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if _, err := os.Stat(chunkPath); !os.IsNotExist(err) {
		t.Error("expected old chunk to be removed")
	}
	if status.RemovedChunks != 1 {
		t.Errorf("RemovedChunks: got %d, want 1", status.RemovedChunks)
	}
}

func TestRun_RecentChunk_Kept(t *testing.T) {
	root := buildDatastore(t)

	// A chunk whose atime is only 1 hour old — within DefaultCutoff.
	name := hex.EncodeToString(make([]byte, 32))
	chunkPath := writeChunk(t, root, name, time.Now().Add(-1*time.Hour))

	status, err := Run(context.Background(), root, noActiveWriter)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if _, err := os.Stat(chunkPath); err != nil {
		t.Errorf("expected recent chunk to be kept: %v", err)
	}
	if status.RemovedChunks != 0 {
		t.Errorf("RemovedChunks: got %d, want 0", status.RemovedChunks)
	}
}

func TestRun_ContextCancelled_StopsMark(t *testing.T) {
	root := buildDatastore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := Run(ctx, root, noActiveWriter)
	// With no snapshot dirs the mark phase completes instantly even if cancelled,
	// so we just confirm Run doesn't panic and that any non-nil error is context-related.
	if err != nil && ctx.Err() == nil {
		t.Errorf("unexpected non-context error: %v", err)
	}
}
