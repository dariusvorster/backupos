package snaplock

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestAcquireShared_NonexistentPath_ReturnsError(t *testing.T) {
	_, err := AcquireShared("/nonexistent/path/that/does/not/exist")
	if err == nil {
		t.Error("expected error for nonexistent path, got nil")
	}
}

func TestAcquireShared_RegularFile_ReturnsError(t *testing.T) {
	tmp := t.TempDir()
	f, err := os.CreateTemp(tmp, "notadir")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	_, err = AcquireShared(f.Name())
	if err == nil {
		t.Error("expected error for regular file, got nil")
	}
}

func TestAcquireShared_HappyPath(t *testing.T) {
	dir := t.TempDir()
	lock, err := AcquireShared(dir)
	if err != nil {
		t.Fatalf("AcquireShared: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Errorf("Release: %v", err)
	}
}

// TestTwoConcurrentSharedLocks is the core invariant: two shared locks on the
// same directory must both succeed. This proves we use LOCK_SH, not LOCK_EX.
func TestTwoConcurrentSharedLocks(t *testing.T) {
	dir := t.TempDir()

	l1, err := AcquireShared(dir)
	if err != nil {
		t.Fatalf("first AcquireShared: %v", err)
	}
	defer l1.Release()

	l2, err := AcquireShared(dir)
	if err != nil {
		t.Fatalf("second AcquireShared failed while first held: %v", err)
	}
	defer l2.Release()
}

// TestAcquireShared_BlockedByExclusiveLock verifies that a pre-held LOCK_EX
// causes AcquireShared to return ErrLockBusy.
func TestAcquireShared_BlockedByExclusiveLock_ReturnsErrLockBusy(t *testing.T) {
	dir := t.TempDir()

	// Manually acquire an exclusive lock on a separate fd.
	f, err := os.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatalf("LOCK_EX: %v", err)
	}
	defer syscall.Flock(int(f.Fd()), syscall.LOCK_UN)

	_, err = AcquireShared(dir)
	if !errors.Is(err, ErrLockBusy) {
		t.Errorf("expected ErrLockBusy, got %v", err)
	}
}

// TestRelease_Idempotent verifies Release() is safe to call multiple times.
func TestRelease_Idempotent(t *testing.T) {
	dir := t.TempDir()
	lock, err := AcquireShared(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := lock.Release(); err != nil {
		t.Fatalf("first Release: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Errorf("second Release: %v", err)
	}
}

// TestReleasingOneSharedLockLeavesOtherIntact verifies that releasing one of
// two concurrent shared locks does not affect the other.
func TestReleasingOneSharedLockLeavesOtherIntact(t *testing.T) {
	dir := t.TempDir()

	l1, err := AcquireShared(dir)
	if err != nil {
		t.Fatal(err)
	}
	l2, err := AcquireShared(dir)
	if err != nil {
		t.Fatal(err)
	}

	// Release l1; l2 should still be valid.
	if err := l1.Release(); err != nil {
		t.Fatalf("l1 Release: %v", err)
	}

	// Attempting LOCK_EX while l2 is still held should fail.
	f, err := os.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	flockErr := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if flockErr == nil {
		t.Error("expected LOCK_EX to fail while l2 still held")
		syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
	}

	// Release l2; now LOCK_EX should succeed.
	if err := l2.Release(); err != nil {
		t.Fatalf("l2 Release: %v", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Errorf("LOCK_EX after both shared locks released: %v", err)
	}
}

// TestAcquireShared_NestedSubdir verifies the path need not be the datastore
// root — any directory works.
func TestAcquireShared_NestedSubdir(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "vm", "100", "2024-12-24T00:26:40Z")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	lock, err := AcquireShared(nested)
	if err != nil {
		t.Fatalf("AcquireShared nested: %v", err)
	}
	if err := lock.Release(); err != nil {
		t.Errorf("Release: %v", err)
	}
}
