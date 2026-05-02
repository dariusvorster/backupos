package previous

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

const (
	testBackupType = "vm"
	testBackupID   = "100"
	t0Str          = "2024-12-24T00:26:40Z"
	t1Str          = "2025-01-01T00:00:00Z"
	t2Str          = "2025-06-01T00:00:00Z"
	futureStr      = "2099-01-01T00:00:00Z"
)

var (
	t0, _ = time.Parse(time.RFC3339, t0Str)
	t1, _ = time.Parse(time.RFC3339, t1Str)
	t2, _ = time.Parse(time.RFC3339, t2Str)
)

// makeGroupDir creates <root>/<backupType>/<backupID>/ and returns root.
func makeGroupDir(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, testBackupType, testBackupID), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

// makeSnapDir creates a snapshot directory with an optional .fidx index file.
func makeSnapDir(t *testing.T, root string, ts time.Time, withIndex bool) string {
	t.Helper()
	name := ts.UTC().Format(time.RFC3339)
	p := filepath.Join(root, testBackupType, testBackupID, name)
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatal(err)
	}
	if withIndex {
		if err := os.WriteFile(filepath.Join(p, "drive-0.img.fidx"), []byte("fidx"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return p
}

func TestFind_NoGroup_ReturnsErrNoPrevious(t *testing.T) {
	root := t.TempDir()
	_, err := Find(root, namespace.Root(), testBackupType, testBackupID, t2)
	if err != ErrNoPrevious {
		t.Errorf("expected ErrNoPrevious, got %v", err)
	}
}

func TestFind_EmptyGroup_ReturnsErrNoPrevious(t *testing.T) {
	root := makeGroupDir(t)
	_, err := Find(root, namespace.Root(), testBackupType, testBackupID, t2)
	if err != ErrNoPrevious {
		t.Errorf("expected ErrNoPrevious, got %v", err)
	}
}

func TestFind_NoIndexes_ReturnsErrNoPrevious(t *testing.T) {
	root := makeGroupDir(t)
	// Snapshot dir exists but has no .fidx/.didx files.
	makeSnapDir(t, root, t0, false)
	_, err := Find(root, namespace.Root(), testBackupType, testBackupID, t2)
	if err != ErrNoPrevious {
		t.Errorf("expected ErrNoPrevious (no real archives), got %v", err)
	}
}

func TestFind_OnlyCurrentSnapshot_ReturnsErrNoPrevious(t *testing.T) {
	root := makeGroupDir(t)
	// The only snapshot is the current one — must not count as previous.
	makeSnapDir(t, root, t1, true)
	_, err := Find(root, namespace.Root(), testBackupType, testBackupID, t1)
	if err != ErrNoPrevious {
		t.Errorf("expected ErrNoPrevious (only current snapshot), got %v", err)
	}
}

func TestFind_OnePrevious_ReturnsIt(t *testing.T) {
	root := makeGroupDir(t)
	snapPath := makeSnapDir(t, root, t0, true)

	snap, err := Find(root, namespace.Root(), testBackupType, testBackupID, t1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if snap.Path != snapPath {
		t.Errorf("path: got %q, want %q", snap.Path, snapPath)
	}
	if !snap.Time.Equal(t0) {
		t.Errorf("time: got %v, want %v", snap.Time, t0)
	}
}

func TestFind_MultiplePrevious_ReturnsNewest(t *testing.T) {
	root := makeGroupDir(t)
	makeSnapDir(t, root, t0, true)
	newerPath := makeSnapDir(t, root, t1, true)

	// Current backup is t2 — both t0 and t1 are previous, t1 is newer.
	snap, err := Find(root, namespace.Root(), testBackupType, testBackupID, t2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if snap.Path != newerPath {
		t.Errorf("expected newest previous (%q), got %q", newerPath, snap.Path)
	}
	if !snap.Time.Equal(t1) {
		t.Errorf("time: got %v, want %v", snap.Time, t1)
	}
}

func TestFind_NamespacedGroup(t *testing.T) {
	root := t.TempDir()
	ns, _ := namespace.Parse("alice")
	// Create snapshot under ns/alice/vm/100/
	nsGroupPath := filepath.Join(ns.JoinPath(root), testBackupType, testBackupID)
	if err := os.MkdirAll(nsGroupPath, 0o755); err != nil {
		t.Fatal(err)
	}
	snapName := t0.UTC().Format(time.RFC3339)
	snapPath := filepath.Join(nsGroupPath, snapName)
	if err := os.MkdirAll(snapPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(snapPath, "drive-0.img.fidx"), []byte("fidx"), 0o644); err != nil {
		t.Fatal(err)
	}

	snap, err := Find(root, ns, testBackupType, testBackupID, t1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if snap.Path != snapPath {
		t.Errorf("path: got %q, want %q", snap.Path, snapPath)
	}
}
