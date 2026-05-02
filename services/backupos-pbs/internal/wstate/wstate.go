// Package wstate holds per-session writer state shared between H2 stream
// handlers. This mirrors the Rust SharedBackupState in environment.rs.
//
// All fields are protected by a single mutex.
package wstate

import (
	"fmt"
	"sync"
)

// BackupPhase tracks whether the session is still accepting writes.
type BackupPhase int

const (
	PhaseActive BackupPhase = iota
	PhaseFinishing
	PhaseFinished
)

// FixedIndexWriter is the contract wstate needs from a fidx writer.
// Concrete implementation lives in internal/fidx.
type FixedIndexWriter interface {
	AddChunk(offset uint64, size uint32, digest [32]byte) error
	IndexLength() uint64
	Close() ([32]byte, error)
	UUID() [16]byte
	Drop()
}

// FixedWriter holds mutable state for one open .fidx writer.
type FixedWriter struct {
	Name            string
	Index           FixedIndexWriter
	Size            *uint64
	ChunkSize       uint32
	ChunkCount      uint64
	SmallChunkCount int
	Incremental     bool
	Closed          bool
}

// DynamicIndexWriter is the contract wstate needs from a didx writer.
// Concrete implementation lives in internal/didx.
type DynamicIndexWriter interface {
	AddChunk(offset uint64, digest [32]byte) error
	IndexLength() uint64
	Close() ([32]byte, error)
	UUID() [16]byte
	Drop()
}

// DynamicWriter holds mutable state for one open .didx writer.
type DynamicWriter struct {
	Name       string
	Index      DynamicIndexWriter
	ChunkCount uint64
	Closed     bool
}

// State is the per-session shared writer state.
type State struct {
	mu             sync.Mutex
	finished       BackupPhase
	widCounter     int
	fixedWriters   map[int]*FixedWriter
	dynamicWriters map[int]*DynamicWriter
	knownChunks    map[[32]byte]uint32
}

// New allocates a fresh State for a new backup session.
func New() *State {
	return &State{
		finished:       PhaseActive,
		fixedWriters:   make(map[int]*FixedWriter),
		dynamicWriters: make(map[int]*DynamicWriter),
		knownChunks:    make(map[[32]byte]uint32),
	}
}

// EnsureUnfinished returns an error if the session is no longer active.
// Caller must hold s.mu.
func (s *State) EnsureUnfinished() error {
	if s.finished != PhaseActive {
		return fmt.Errorf("backup session already finishing or finished")
	}
	return nil
}

// nextWid increments and returns the next writer ID.
// Caller must hold s.mu.
func (s *State) nextWid() (int, error) {
	s.widCounter++
	if s.widCounter > 256 {
		return 0, fmt.Errorf("too many writers in session (max 256)")
	}
	return s.widCounter, nil
}

// RegisterFixedWriter inserts a new FixedWriter and returns its wid.
func (s *State) RegisterFixedWriter(name string, index FixedIndexWriter, size *uint64, chunkSize uint32, incremental bool) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return 0, err
	}
	wid, err := s.nextWid()
	if err != nil {
		return 0, err
	}
	s.fixedWriters[wid] = &FixedWriter{
		Name:        name,
		Index:       index,
		Size:        size,
		ChunkSize:   chunkSize,
		Incremental: incremental,
	}
	return wid, nil
}

// LookupChunk returns the plaintext size of a previously uploaded chunk, if any.
func (s *State) LookupChunk(digest [32]byte) (uint32, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	size, ok := s.knownChunks[digest]
	return size, ok
}

// RegisterFixedChunk records a successfully uploaded chunk in the known_chunks
// map and validates size constraints for the associated writer.
func (s *State) RegisterFixedChunk(wid int, digest [32]byte, size uint32, isDuplicate bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return err
	}
	w, ok := s.fixedWriters[wid]
	if !ok {
		return fmt.Errorf("fixed writer %d not registered", wid)
	}
	if w.Closed {
		return fmt.Errorf("fixed writer %q already closed", w.Name)
	}
	if size > w.ChunkSize {
		return fmt.Errorf("fixed writer %q got chunk too large (%d > %d)", w.Name, size, w.ChunkSize)
	}
	if size < w.ChunkSize {
		w.SmallChunkCount++
		if w.SmallChunkCount > 1 {
			return fmt.Errorf("fixed writer %q got multiple small chunks", w.Name)
		}
	}
	s.knownChunks[digest] = size
	_ = isDuplicate
	return nil
}

// FixedWriterAppendChunk associates an uploaded chunk with a position in the
// .fidx index. The digest must already be in known_chunks (checked by caller).
func (s *State) FixedWriterAppendChunk(wid int, offset uint64, size uint32, digest [32]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return err
	}
	w, ok := s.fixedWriters[wid]
	if !ok {
		return fmt.Errorf("fixed writer %d not registered", wid)
	}
	if w.Closed {
		return fmt.Errorf("fixed writer %q already closed", w.Name)
	}
	if err := w.Index.AddChunk(offset, size, digest); err != nil {
		return fmt.Errorf("fixed writer %q add_chunk failed: %w", w.Name, err)
	}
	w.ChunkCount++
	return nil
}

// FixedWriterClose finalises a writer, verifying chunk count and checksums.
// Returns the server-computed index checksum on success.
func (s *State) FixedWriterClose(wid int, chunkCount uint64, size uint64, csum [32]byte) ([32]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return [32]byte{}, err
	}
	w, ok := s.fixedWriters[wid]
	if !ok {
		return [32]byte{}, fmt.Errorf("fixed writer %d not registered", wid)
	}
	if w.Closed {
		return [32]byte{}, fmt.Errorf("fixed writer %q already closed", w.Name)
	}
	if w.ChunkCount != chunkCount {
		return [32]byte{}, fmt.Errorf("fixed writer %q close: server saw %d chunks, client expected %d",
			w.Name, w.ChunkCount, chunkCount)
	}
	if !w.Incremental {
		expectedCount := w.Index.IndexLength()
		if chunkCount != expectedCount {
			return [32]byte{}, fmt.Errorf("fixed writer %q close: index_length=%d, chunk_count=%d",
				w.Name, expectedCount, chunkCount)
		}
		if w.Size != nil && *w.Size != size {
			return [32]byte{}, fmt.Errorf("fixed writer %q close: known_size=%d, client_size=%d",
				w.Name, *w.Size, size)
		}
	}

	gotCsum, err := w.Index.Close()
	if err != nil {
		return [32]byte{}, fmt.Errorf("fixed writer %q close failed: %w", w.Name, err)
	}
	if gotCsum != csum {
		return [32]byte{}, fmt.Errorf("fixed writer %q close: server csum != client csum", w.Name)
	}
	w.Closed = true
	return gotCsum, nil
}

// RegisterDynamicWriter inserts a new DynamicWriter and returns its wid.
func (s *State) RegisterDynamicWriter(name string, index DynamicIndexWriter) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return 0, err
	}
	wid, err := s.nextWid()
	if err != nil {
		return 0, err
	}
	s.dynamicWriters[wid] = &DynamicWriter{
		Name:  name,
		Index: index,
	}
	return wid, nil
}

// RegisterDynamicChunk records a successfully uploaded chunk in known_chunks.
// Unlike fixed chunks, there is no chunk-size constraint for dynamic writers.
func (s *State) RegisterDynamicChunk(wid int, digest [32]byte, size uint32, isDuplicate bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return err
	}
	w, ok := s.dynamicWriters[wid]
	if !ok {
		return fmt.Errorf("dynamic writer %d not registered", wid)
	}
	if w.Closed {
		return fmt.Errorf("dynamic writer %q already closed", w.Name)
	}
	s.knownChunks[digest] = size
	_ = isDuplicate
	return nil
}

// DynamicWriterAppendChunk associates an uploaded chunk with a position in the
// .didx index. The digest must already be in known_chunks (checked by caller).
// No size is passed — dynamic index entries carry only (offset, digest).
func (s *State) DynamicWriterAppendChunk(wid int, offset uint64, digest [32]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return err
	}
	w, ok := s.dynamicWriters[wid]
	if !ok {
		return fmt.Errorf("dynamic writer %d not registered", wid)
	}
	if w.Closed {
		return fmt.Errorf("dynamic writer %q already closed", w.Name)
	}
	if err := w.Index.AddChunk(offset, digest); err != nil {
		return fmt.Errorf("dynamic writer %q add_chunk failed: %w", w.Name, err)
	}
	w.ChunkCount++
	return nil
}

// DynamicWriterClose finalises a writer, verifying chunk count and checksum.
// No size validation — dynamic index size is not known upfront.
func (s *State) DynamicWriterClose(wid int, chunkCount uint64, csum [32]byte) ([32]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.EnsureUnfinished(); err != nil {
		return [32]byte{}, err
	}
	w, ok := s.dynamicWriters[wid]
	if !ok {
		return [32]byte{}, fmt.Errorf("dynamic writer %d not registered", wid)
	}
	if w.Closed {
		return [32]byte{}, fmt.Errorf("dynamic writer %q already closed", w.Name)
	}
	if w.ChunkCount != chunkCount {
		return [32]byte{}, fmt.Errorf("dynamic writer %q close: server saw %d chunks, client expected %d",
			w.Name, w.ChunkCount, chunkCount)
	}
	if w.Index.IndexLength() != chunkCount {
		return [32]byte{}, fmt.Errorf("dynamic writer %q close: index_length=%d, chunk_count=%d",
			w.Name, w.Index.IndexLength(), chunkCount)
	}
	gotCsum, err := w.Index.Close()
	if err != nil {
		return [32]byte{}, fmt.Errorf("dynamic writer %q close failed: %w", w.Name, err)
	}
	if gotCsum != csum {
		return [32]byte{}, fmt.Errorf("dynamic writer %q close: server csum != client csum", w.Name)
	}
	w.Closed = true
	return gotCsum, nil
}

// Cleanup drops any open writers (frees mmap/tmpfile) and marks the session
// finished. Called from the upgrade handler after ServeConn returns.
func (s *State) Cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, w := range s.fixedWriters {
		if !w.Closed {
			w.Index.Drop()
		}
	}
	for _, w := range s.dynamicWriters {
		if !w.Closed {
			w.Index.Drop()
		}
	}
	s.finished = PhaseFinished
}
