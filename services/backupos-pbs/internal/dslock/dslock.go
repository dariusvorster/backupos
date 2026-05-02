// Package dslock provides per-datastore exclusive locking for GC.
// Uses flock(LOCK_EX | LOCK_NB) on a sentinel file in the datastore root.
package dslock

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
)

const lockFileName = ".gc.lock"

// ErrGCBusy is returned when a GC is already running on this datastore.
var ErrGCBusy = errors.New("GC already running on this datastore")

// Lock holds an open file descriptor with an exclusive advisory lock.
// Caller must invoke Release() to drop the lock and close the fd.
type Lock struct {
	mu     sync.Mutex
	file   *os.File
	closed bool
}

// AcquireExclusive obtains the per-datastore GC lock. Non-blocking.
// Returns ErrGCBusy if another GC is already running.
func AcquireExclusive(datastoreRoot string) (*Lock, error) {
	lockPath := filepath.Join(datastoreRoot, lockFileName)
	f, err := os.OpenFile(lockPath, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrGCBusy
		}
		return nil, fmt.Errorf("flock LOCK_EX: %w", err)
	}
	return &Lock{file: f}, nil
}

// Release drops the exclusive lock and closes the underlying fd.
// Safe to call multiple times.
func (l *Lock) Release() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return nil
	}
	l.closed = true
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	return l.file.Close()
}
