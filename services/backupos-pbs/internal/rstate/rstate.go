// Package rstate holds per-reader-session state shared between H2 stream
// handlers. Mirrors wstate but for read-only reader sessions.
//
// The single piece of state is allowed_chunks: a set of digests the
// client is permitted to download via GET /chunk. The set is populated
// by GET /download on a .fidx or .didx file (which registers all chunks
// referenced by the index). This matches PBS reference's register_chunk /
// check_chunk_access in src/api2/reader/environment.rs.
package rstate

import "sync"

// State is the per-reader-session state.
type State struct {
	mu            sync.RWMutex
	allowedChunks map[[32]byte]struct{}
}

// New allocates a fresh State for a new reader session.
func New() *State {
	return &State{
		allowedChunks: make(map[[32]byte]struct{}),
	}
}

// RegisterChunk adds a digest to the allowed set. Idempotent.
func (s *State) RegisterChunk(digest [32]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.allowedChunks[digest] = struct{}{}
}

// CheckChunkAccess returns true if the digest has been registered.
func (s *State) CheckChunkAccess(digest [32]byte) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.allowedChunks[digest]
	return ok
}

// AllowedCount returns the number of registered chunks. Used for logging.
func (s *State) AllowedCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.allowedChunks)
}
