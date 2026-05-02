// Package fidx implements writers for the PBS Fixed Index (.fidx) file format.
//
// Header layout (4096 bytes, all integers little-endian):
//
//	offset 0:    magic      [8]byte   = {47,127,65,237,145,253,15,205}
//	offset 8:    uuid       [16]byte  = random per writer
//	offset 24:   ctime      int64     = unix epoch seconds
//	offset 32:   index_csum [32]byte  = SHA256(digest_0 || digest_1 || ...) — written at Close
//	offset 64:   size       uint64    = total content size — written at Close
//	offset 72:   chunk_size uint64    = power of 2, in bytes
//	offset 80:   reserved   [4016]byte = zeros
//
// Body (immediately after header):
//
//	offset 4096 + i*32: digest_i [32]byte
//
// File size = 4096 + index_length * 32
// where index_length = ceil(size / chunk_size).
package fidx

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// Magic is the fixed-index file magic from file_formats.rs — do not modify.
var Magic = [8]byte{47, 127, 65, 237, 145, 253, 15, 205}

const (
	headerSize = 4096
	digestSize = 32
)

// Writer is a memory-mapped .fidx file writer. The file is written atomically
// via a temp-file rename on Close.
type Writer struct {
	mu sync.Mutex

	finalPath string
	tmpPath   string
	file      *os.File
	mmap      []byte

	chunkSize     uint64
	size          uint64
	indexLength   uint64

	uuid  [16]byte
	ctime int64

	closed bool
}

// Create allocates a new .fidx writer. The file is written to a temp path
// inside the same directory as finalPath and renamed on Close.
//
// knownSize must be > 0 (growable .fidx writers are deferred to a future PR).
// chunkSize must be a power of two.
func Create(finalPath string, knownSize uint64, chunkSize uint32) (*Writer, error) {
	if chunkSize == 0 || chunkSize&(chunkSize-1) != 0 {
		return nil, fmt.Errorf("chunk_size must be a power of two, got %d", chunkSize)
	}
	if knownSize == 0 {
		return nil, fmt.Errorf("growable .fidx writers not supported in V1 (size must be > 0)")
	}

	tmpSuffix := make([]byte, 8)
	if _, err := rand.Read(tmpSuffix); err != nil {
		return nil, err
	}
	tmpPath := finalPath + ".tmp." + hex.EncodeToString(tmpSuffix)

	f, err := os.OpenFile(tmpPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open temp fidx: %w", err)
	}

	indexLength := (knownSize + uint64(chunkSize) - 1) / uint64(chunkSize)
	fileSize := int64(headerSize) + int64(indexLength)*int64(digestSize)
	if err := f.Truncate(fileSize); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("truncate fidx: %w", err)
	}

	mm, err := syscall.Mmap(int(f.Fd()), 0, int(fileSize),
		syscall.PROT_READ|syscall.PROT_WRITE, syscall.MAP_SHARED)
	if err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("mmap fidx: %w", err)
	}

	var uuid [16]byte
	if _, err := rand.Read(uuid[:]); err != nil {
		_ = syscall.Munmap(mm)
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return nil, err
	}
	ctime := time.Now().Unix()

	w := &Writer{
		finalPath:   finalPath,
		tmpPath:     tmpPath,
		file:        f,
		mmap:        mm,
		chunkSize:   uint64(chunkSize),
		size:        knownSize,
		indexLength: indexLength,
		uuid:        uuid,
		ctime:       ctime,
	}
	w.writeInitialHeader()
	return w, nil
}

// writeInitialHeader populates the header fields that are known at create time.
func (w *Writer) writeInitialHeader() {
	copy(w.mmap[0:8], Magic[:])
	copy(w.mmap[8:24], w.uuid[:])
	binary.LittleEndian.PutUint64(w.mmap[24:32], uint64(w.ctime))
	// index_csum (32:64) and size (64:72) are written at Close.
	binary.LittleEndian.PutUint64(w.mmap[72:80], w.chunkSize)
}

// AddChunk writes digest into the index slot corresponding to the chunk ending
// at offset. offset is the byte position AFTER this chunk (PBS convention).
func (w *Writer) AddChunk(offset uint64, size uint32, digest [32]byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return errors.New("AddChunk called on closed writer")
	}
	if size == 0 {
		return errors.New("zero-size chunk not allowed")
	}
	if offset > w.size {
		return fmt.Errorf("chunk end %d exceeds total size %d", offset, w.size)
	}
	if uint64(size) > w.chunkSize {
		return fmt.Errorf("chunk size %d > chunk_size %d", size, w.chunkSize)
	}
	// Non-last chunks must be full chunk_size.
	if offset != w.size && uint64(size) != w.chunkSize {
		return fmt.Errorf("non-last chunk has wrong size %d (expected %d)", size, w.chunkSize)
	}
	pos := offset - uint64(size)
	if pos%w.chunkSize != 0 {
		return fmt.Errorf("chunk start %d not aligned to chunk_size %d", pos, w.chunkSize)
	}
	idx := pos / w.chunkSize
	if idx >= w.indexLength {
		return fmt.Errorf("chunk index %d out of range (length %d)", idx, w.indexLength)
	}
	bodyOffset := uint64(headerSize) + idx*digestSize
	copy(w.mmap[bodyOffset:bodyOffset+digestSize], digest[:])
	return nil
}

// IndexLength returns the number of digest slots in this index.
func (w *Writer) IndexLength() uint64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.indexLength
}

// UUID returns the per-writer random UUID embedded in the header.
func (w *Writer) UUID() [16]byte { return w.uuid }

// Close finalises the .fidx file: computes index_csum, writes size and csum
// into the header, msyncs, fsyncs, and renames the temp file to finalPath.
// Returns the computed index checksum.
func (w *Writer) Close() ([32]byte, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return [32]byte{}, errors.New("already closed")
	}

	bodyStart := uint64(headerSize)
	bodyEnd := bodyStart + w.indexLength*digestSize
	digestArea := w.mmap[bodyStart:bodyEnd]
	csum := sha256.Sum256(digestArea)

	copy(w.mmap[32:64], csum[:])
	binary.LittleEndian.PutUint64(w.mmap[64:72], w.size)

	_ = msync(w.mmap)

	if err := syscall.Munmap(w.mmap); err != nil {
		return [32]byte{}, fmt.Errorf("munmap: %w", err)
	}
	w.mmap = nil

	if err := w.file.Sync(); err != nil {
		_ = w.file.Close()
		_ = os.Remove(w.tmpPath)
		return [32]byte{}, fmt.Errorf("fsync fidx: %w", err)
	}
	if err := w.file.Close(); err != nil {
		_ = os.Remove(w.tmpPath)
		return [32]byte{}, fmt.Errorf("close fidx: %w", err)
	}
	w.file = nil

	if err := os.Rename(w.tmpPath, w.finalPath); err != nil {
		_ = os.Remove(w.tmpPath)
		return [32]byte{}, fmt.Errorf("rename fidx to final: %w", err)
	}

	if d, err := os.Open(filepath.Dir(w.finalPath)); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}

	w.closed = true
	return csum, nil
}

// Drop discards the writer, removing the temp file without promoting it.
// Safe to call on an already-closed writer (no-op).
func (w *Writer) Drop() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	if w.mmap != nil {
		_ = syscall.Munmap(w.mmap)
		w.mmap = nil
	}
	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}
	_ = os.Remove(w.tmpPath)
	w.closed = true
}

func msync(b []byte) error {
	if len(b) == 0 {
		return nil
	}
	_, _, errno := syscall.Syscall(syscall.SYS_MSYNC,
		uintptr(unsafe.Pointer(&b[0])),
		uintptr(len(b)),
		uintptr(syscall.MS_SYNC))
	if errno != 0 {
		return errno
	}
	return nil
}
