package rstate

import (
	"sync"
	"testing"
)

func TestRegisterChunk_AddsToAllowedSet(t *testing.T) {
	s := New()
	var d [32]byte
	d[0] = 0xAB
	s.RegisterChunk(d)
	if !s.CheckChunkAccess(d) {
		t.Error("registered chunk not found")
	}
}

func TestCheckChunkAccess_UnregisteredReturnsfalse(t *testing.T) {
	s := New()
	var d [32]byte
	d[0] = 0xFF
	if s.CheckChunkAccess(d) {
		t.Error("unregistered chunk returned true")
	}
}

func TestRegisterChunk_Idempotent(t *testing.T) {
	s := New()
	var d [32]byte
	d[0] = 0x01
	s.RegisterChunk(d)
	s.RegisterChunk(d)
	if s.AllowedCount() != 1 {
		t.Errorf("expected count 1 after idempotent register, got %d", s.AllowedCount())
	}
}

func TestAllowedCount_ReturnsCorrectCount(t *testing.T) {
	s := New()
	if s.AllowedCount() != 0 {
		t.Errorf("initial count: got %d, want 0", s.AllowedCount())
	}
	for i := 0; i < 5; i++ {
		var d [32]byte
		d[0] = byte(i + 1)
		s.RegisterChunk(d)
	}
	if s.AllowedCount() != 5 {
		t.Errorf("count after 5 registers: got %d, want 5", s.AllowedCount())
	}
}

func TestRegisterChunk_ConcurrentFromNGoroutines(t *testing.T) {
	s := New()
	const n = 100
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			var d [32]byte
			d[0] = byte(i % 256)
			d[1] = byte(i / 256)
			s.RegisterChunk(d)
			s.CheckChunkAccess(d)
			s.AllowedCount()
		}()
	}
	wg.Wait()
}
