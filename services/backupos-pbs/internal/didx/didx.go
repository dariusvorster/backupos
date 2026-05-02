// Package didx writes PBS dynamic-index (.didx) files.
//
// The .didx format stores variable-size chunks for file archive backups
// (.pxar). Unlike .fidx (which is mmap'd because the total size is known
// upfront), .didx uses a buffered writer because the number of chunks is
// unknown at creation time.
//
// Wire format:
//
//	Header (4096 bytes):
//	  [0:8]   magic
//	  [8:24]  uuid (random)
//	  [24:32] ctime (Unix seconds, little-endian int64)
//	  [32:64] index_csum (SHA256; written at Close)
//	  [64:]   reserved (zeros)
//
//	Body (40 bytes per chunk):
//	  [0:8]   end offset of chunk (little-endian uint64)
//	  [8:40]  SHA256 digest of plaintext chunk
//
// index_csum = SHA256(entry_1 || entry_2 || …) where each entry is the
// full 40-byte body record.
package didx

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"hash"
	"os"
	"time"
)

// Magic is the .didx file magic, matching DynamicIndexMagic in Proxmox.
var Magic = [8]byte{28, 145, 78, 165, 25, 186, 179, 205}

const headerSize = 4096
const csumOffset = 32

// Writer is an open .didx file being assembled.
type Writer struct {
	tmpPath   string
	finalPath string
	f         *os.File
	bw        *bufio.Writer
	uuid      [16]byte
	hasher    hash.Hash
	count     uint64
	closed    bool
	dropped   bool
}

// Create opens a new temporary .didx file and writes the header.
// The final file is not visible until Close succeeds.
func Create(finalPath string) (*Writer, error) {
	tmpPath := finalPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return nil, fmt.Errorf("didx create %q: %w", tmpPath, err)
	}

	var uuid [16]byte
	if _, err := rand.Read(uuid[:]); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("didx uuid: %w", err)
	}

	ctime := time.Now().Unix()

	var header [headerSize]byte
	copy(header[0:8], Magic[:])
	copy(header[8:24], uuid[:])
	binary.LittleEndian.PutUint64(header[24:32], uint64(ctime))
	// index_csum at [32:64] is zero-initialised; written at Close.

	bw := bufio.NewWriterSize(f, 64*1024)
	if _, err := bw.Write(header[:]); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("didx write header: %w", err)
	}

	return &Writer{
		tmpPath:   tmpPath,
		finalPath: finalPath,
		f:         f,
		bw:        bw,
		uuid:      uuid,
		hasher:    sha256.New(),
	}, nil
}

// AddChunk appends a 40-byte entry (end_offset || digest) to the index.
// offset is the cumulative end offset of this chunk (PBS convention).
func (w *Writer) AddChunk(offset uint64, digest [32]byte) error {
	if w.closed || w.dropped {
		return fmt.Errorf("didx writer already closed or dropped")
	}
	var entry [40]byte
	binary.LittleEndian.PutUint64(entry[0:8], offset)
	copy(entry[8:40], digest[:])
	if _, err := w.bw.Write(entry[:]); err != nil {
		return fmt.Errorf("didx write entry: %w", err)
	}
	_, _ = w.hasher.Write(entry[:])
	w.count++
	return nil
}

// IndexLength returns the number of chunks written so far.
func (w *Writer) IndexLength() uint64 { return w.count }

// UUID returns the UUID embedded in the file header.
func (w *Writer) UUID() [16]byte { return w.uuid }

// Close flushes all buffered data, seeks back to write the index checksum,
// fsyncs, and atomically renames the temp file to the final path.
func (w *Writer) Close() ([32]byte, error) {
	if w.closed || w.dropped {
		return [32]byte{}, fmt.Errorf("didx writer already closed or dropped")
	}

	if err := w.bw.Flush(); err != nil {
		return [32]byte{}, fmt.Errorf("didx flush: %w", err)
	}

	var csum [32]byte
	copy(csum[:], w.hasher.Sum(nil))

	if _, err := w.f.Seek(csumOffset, 0); err != nil {
		return [32]byte{}, fmt.Errorf("didx seek for csum: %w", err)
	}
	if _, err := w.f.Write(csum[:]); err != nil {
		return [32]byte{}, fmt.Errorf("didx write csum: %w", err)
	}

	if err := w.f.Sync(); err != nil {
		return [32]byte{}, fmt.Errorf("didx fsync: %w", err)
	}
	if err := w.f.Close(); err != nil {
		return [32]byte{}, fmt.Errorf("didx close file: %w", err)
	}
	w.closed = true

	if err := os.Rename(w.tmpPath, w.finalPath); err != nil {
		return [32]byte{}, fmt.Errorf("didx rename: %w", err)
	}
	return csum, nil
}

// Drop aborts the writer: closes and removes the temp file.
func (w *Writer) Drop() {
	if w.closed || w.dropped {
		return
	}
	w.dropped = true
	_ = w.f.Close()
	_ = os.Remove(w.tmpPath)
}
