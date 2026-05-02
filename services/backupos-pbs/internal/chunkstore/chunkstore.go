// Package chunkstore implements content-addressed chunk storage for PBS.
//
// Chunks are stored at:
//
//	<datastore-root>/.chunks/<prefix4>/<full-64-hex-digest>
//
// where prefix4 is the first 4 hex characters of the digest (= first 2 bytes).
// Production deployments pre-create all 65536 shard directories at setup time
// (M4a). Tests must create the specific shard dirs they need.
package chunkstore

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Store is a handle to a content-addressed chunk directory.
// The mutex guards concurrent inserts to the same chunk path.
type Store struct {
	root string
	mu   sync.Mutex
}

// New returns a Store rooted at datastoreRoot. Returns an error if
// <root>/.chunks does not exist or is not a directory.
func New(root string) (*Store, error) {
	chunkDir := filepath.Join(root, ".chunks")
	st, err := os.Stat(chunkDir)
	if err != nil {
		return nil, fmt.Errorf("chunk dir not accessible: %w", err)
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("chunk dir is not a directory: %s", chunkDir)
	}
	return &Store{root: root}, nil
}

// Path returns the filesystem path for the chunk identified by digest.
func (s *Store) Path(digest [32]byte) string {
	hexDigest := hex.EncodeToString(digest[:])
	prefix := hexDigest[:4]
	return filepath.Join(s.root, ".chunks", prefix, hexDigest)
}

// Insert writes raw (a full DataBlob) to the chunk store under digest.
//
// Returns (isDuplicate=true, existingSize, nil) if a file with the same size
// already exists — the existing file is kept and its atime is touched.
//
// Returns (isDuplicate=true, existingSize, nil) if a file with a DIFFERENT size
// exists — the existing file is kept with a warning logged (V1 simplification;
// encrypted tie-breaking deferred to M9).
//
// Returns (isDuplicate=false, encodedSize, nil) on a fresh write.
func (s *Store) Insert(digest [32]byte, raw []byte) (bool, uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := s.Path(digest)
	dir := filepath.Dir(path)

	if st, err := os.Stat(path); err == nil {
		if !st.Mode().IsRegular() {
			return false, 0, fmt.Errorf("chunk path %s is not a regular file", path)
		}
		existingSize := uint64(st.Size())
		incomingSize := uint64(len(raw))
		if existingSize == incomingSize {
			if touchErr := touchAtime(path); touchErr != nil {
				slog.Warn("chunk touch failed", "path", path, "error", touchErr)
			}
			return true, existingSize, nil
		}
		slog.Warn("chunk size mismatch on insert; keeping existing",
			"digest", hex.EncodeToString(digest[:]),
			"existing_size", existingSize,
			"incoming_size", incomingSize,
		)
		return true, existingSize, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, 0, fmt.Errorf("stat chunk: %w", err)
	}

	tmpPath, err := writeTempInDir(dir, raw)
	if err != nil {
		return false, 0, fmt.Errorf("write temp: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return false, 0, fmt.Errorf("rename to final: %w", err)
	}
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return false, uint64(len(raw)), nil
}

// writeTempInDir writes raw to a randomly-named temp file inside dir,
// fsyncs it, and returns the path.
func writeTempInDir(dir string, raw []byte) (string, error) {
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return "", err
	}
	tmpPath := filepath.Join(dir, ".chunk.tmp."+hex.EncodeToString(suffix))
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", err
	}
	if _, err := f.Write(raw); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return tmpPath, nil
}

func touchAtime(path string) error {
	now := time.Now()
	return os.Chtimes(path, now, now)
}
