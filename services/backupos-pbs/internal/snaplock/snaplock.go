// Package snaplock provides advisory file locking on snapshot directories
// during reader sessions. Uses the flock() syscall:
//   - LOCK_SH (shared): readers; multiple concurrent readers coexist
//   - LOCK_EX (exclusive): backup writers (not used here, but documents intent)
//
// Multiple concurrent shared locks coexist. An exclusive lock blocks new
// shared locks, and a held shared lock blocks new exclusive locks. This
// matches PBS reference's lock_shared() semantics on backup_dir.
package snaplock

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"syscall"
)

// SharedLock holds an open file descriptor with a shared advisory lock.
// Caller must invoke Release() to drop the lock and close the fd.
type SharedLock struct {
	mu     sync.Mutex
	file   *os.File
	closed bool
}

// ErrLockBusy is returned when the lock cannot be acquired immediately
// because an exclusive lock is held by another session.
var ErrLockBusy = errors.New("snapshot is exclusively locked by another session")

// AcquireShared opens the directory at path and obtains a shared (LOCK_SH)
// advisory lock on it. The lock is non-blocking (LOCK_NB): if an exclusive
// lock is held, it returns ErrLockBusy immediately instead of blocking.
func AcquireShared(path string) (*SharedLock, error) {
	st, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat snapshot dir: %w", err)
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("snapshot path is not a directory: %s", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open snapshot dir: %w", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrLockBusy
		}
		return nil, fmt.Errorf("flock LOCK_SH: %w", err)
	}
	return &SharedLock{file: f}, nil
}

// Release drops the shared lock and closes the underlying fd. Safe to
// call multiple times.
func (s *SharedLock) Release() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	_ = syscall.Flock(int(s.file.Fd()), syscall.LOCK_UN)
	return s.file.Close()
}
