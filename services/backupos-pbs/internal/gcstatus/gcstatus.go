// Package gcstatus defines the GC run statistics returned by the sweep phase.
package gcstatus

import "fmt"

// Status collects chunk-level accounting for a single GC run.
//
// RemovedBad and StillBad are reserved for future integrity checking and
// are always zero in the current implementation.
type Status struct {
	RemovedChunks int64
	RemovedBytes  int64
	PendingChunks int64
	PendingBytes  int64
	DiskChunks    int64
	DiskBytes     int64
	RemovedBad    int64
	StillBad      int64
}

// Add merges other into s in place.
func (s *Status) Add(other *Status) {
	s.RemovedChunks += other.RemovedChunks
	s.RemovedBytes += other.RemovedBytes
	s.PendingChunks += other.PendingChunks
	s.PendingBytes += other.PendingBytes
	s.DiskChunks += other.DiskChunks
	s.DiskBytes += other.DiskBytes
	s.RemovedBad += other.RemovedBad
	s.StillBad += other.StillBad
}

// Total returns a new Status that is the sum of s and other.
func (s *Status) Total(other *Status) *Status {
	out := *s
	out.Add(other)
	return &out
}

func (s *Status) String() string {
	return fmt.Sprintf(
		"removed=%d(%dB) pending=%d(%dB) disk=%d(%dB)",
		s.RemovedChunks, s.RemovedBytes,
		s.PendingChunks, s.PendingBytes,
		s.DiskChunks, s.DiskBytes,
	)
}
