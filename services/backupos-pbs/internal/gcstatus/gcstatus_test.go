package gcstatus

import (
	"strings"
	"testing"
)

func TestAdd(t *testing.T) {
	a := &Status{RemovedChunks: 1, RemovedBytes: 100, DiskChunks: 3, DiskBytes: 300}
	b := &Status{RemovedChunks: 2, RemovedBytes: 200, PendingChunks: 1, PendingBytes: 50}
	a.Add(b)
	if a.RemovedChunks != 3 {
		t.Errorf("RemovedChunks: got %d, want 3", a.RemovedChunks)
	}
	if a.RemovedBytes != 300 {
		t.Errorf("RemovedBytes: got %d, want 300", a.RemovedBytes)
	}
	if a.PendingChunks != 1 {
		t.Errorf("PendingChunks: got %d, want 1", a.PendingChunks)
	}
	if a.DiskChunks != 3 {
		t.Errorf("DiskChunks: got %d, want 3", a.DiskChunks)
	}
}

func TestTotal_DoesNotMutateReceiver(t *testing.T) {
	a := &Status{RemovedChunks: 5}
	b := &Status{RemovedChunks: 3}
	c := a.Total(b)
	if a.RemovedChunks != 5 {
		t.Errorf("receiver mutated: got %d, want 5", a.RemovedChunks)
	}
	if c.RemovedChunks != 8 {
		t.Errorf("Total: got %d, want 8", c.RemovedChunks)
	}
}

func TestString_ContainsKeyFields(t *testing.T) {
	s := &Status{RemovedChunks: 7, RemovedBytes: 700, PendingChunks: 2, PendingBytes: 200, DiskChunks: 10, DiskBytes: 1000}
	str := s.String()
	for _, want := range []string{"7", "700", "2", "200", "10", "1000"} {
		if !strings.Contains(str, want) {
			t.Errorf("String() missing %q: %s", want, str)
		}
	}
}
