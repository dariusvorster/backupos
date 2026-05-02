package gcatime

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestTouchChunk_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "chunk")
	if err := os.WriteFile(p, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	before := time.Now().Add(-1 * time.Second)
	if err := TouchChunk(p); err != nil {
		t.Fatalf("TouchChunk: %v", err)
	}

	var st unix.Stat_t
	if err := unix.Stat(p, &st); err != nil {
		t.Fatal(err)
	}
	atime := time.Unix(st.Atim.Sec, st.Atim.Nsec)
	if atime.Before(before) {
		t.Errorf("atime not updated: got %v, want >= %v", atime, before)
	}
}

func TestTouchChunk_NonexistentReturnsNil(t *testing.T) {
	err := TouchChunk("/tmp/this-chunk-does-not-exist-gctest")
	if err != nil {
		t.Errorf("expected nil for nonexistent path, got: %v", err)
	}
}

func TestTouchChunk_PreservesMtime(t *testing.T) {
	tmp := t.TempDir()
	p := filepath.Join(tmp, "chunk")
	if err := os.WriteFile(p, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Set mtime to a known old value.
	oldTime := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(p, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}

	var before unix.Stat_t
	if err := unix.Stat(p, &before); err != nil {
		t.Fatal(err)
	}

	if err := TouchChunk(p); err != nil {
		t.Fatalf("TouchChunk: %v", err)
	}

	var after unix.Stat_t
	if err := unix.Stat(p, &after); err != nil {
		t.Fatal(err)
	}

	// mtime must be unchanged.
	if before.Mtim.Sec != after.Mtim.Sec || before.Mtim.Nsec != after.Mtim.Nsec {
		t.Errorf("mtime changed: before=%d.%d after=%d.%d",
			before.Mtim.Sec, before.Mtim.Nsec, after.Mtim.Sec, after.Mtim.Nsec)
	}
}

func TestVerifyAtimeUpdates_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	if err := VerifyAtimeUpdates(tmp); err != nil {
		t.Fatalf("VerifyAtimeUpdates: %v", err)
	}
}

func TestVerifyAtimeUpdates_CreatesAndDeletesProbe(t *testing.T) {
	tmp := t.TempDir()
	probePath := filepath.Join(tmp, ".gc-probe", "probe")

	if err := VerifyAtimeUpdates(tmp); err != nil {
		t.Fatalf("VerifyAtimeUpdates: %v", err)
	}

	if _, err := os.Stat(probePath); !os.IsNotExist(err) {
		t.Errorf("probe file should be deleted after success, got: %v", err)
	}
}

func TestVerifyAtimeUpdates_NonexistentRoot(t *testing.T) {
	err := VerifyAtimeUpdates("/tmp/this-dir-does-not-exist-gctest-root/sub")
	if err == nil {
		t.Error("expected error for nonexistent root, got nil")
	}
}
