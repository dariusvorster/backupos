package wstate

import (
	"errors"
	"strings"
	"testing"
)

// fakeFidx is a FixedIndexWriter stub for test isolation.
type fakeFidx struct {
	chunks      []chunkEntry
	dropCalled  bool
	closeReturn [32]byte
	closeErr    error
}

type chunkEntry struct {
	offset uint64
	size   uint32
	digest [32]byte
}

func (f *fakeFidx) AddChunk(offset uint64, size uint32, digest [32]byte) error {
	f.chunks = append(f.chunks, chunkEntry{offset, size, digest})
	return nil
}
func (f *fakeFidx) IndexLength() uint64  { return uint64(len(f.chunks)) }
func (f *fakeFidx) Close() ([32]byte, error) {
	return f.closeReturn, f.closeErr
}
func (f *fakeFidx) UUID() [16]byte { return [16]byte{} }
func (f *fakeFidx) Drop()          { f.dropCalled = true }

// errFidx returns an error from AddChunk for error-propagation tests.
type errFidx struct{ addErr error }

func (f *errFidx) AddChunk(_ uint64, _ uint32, _ [32]byte) error { return f.addErr }
func (f *errFidx) IndexLength() uint64                           { return 0 }
func (f *errFidx) Close() ([32]byte, error)                      { return [32]byte{}, nil }
func (f *errFidx) UUID() [16]byte                                { return [16]byte{} }
func (f *errFidx) Drop()                                         {}

func ptrU64(v uint64) *uint64 { return &v }

// ---- RegisterFixedWriter ----

func TestRegisterFixedWriter_AssignsMonotonicWids(t *testing.T) {
	ws := New()
	wid1, err := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(4194304), 4194304, false)
	if err != nil {
		t.Fatal(err)
	}
	wid2, err := ws.RegisterFixedWriter("b.fidx", &fakeFidx{}, ptrU64(4194304), 4194304, false)
	if err != nil {
		t.Fatal(err)
	}
	if wid1 != 1 {
		t.Errorf("first wid: got %d, want 1", wid1)
	}
	if wid2 != 2 {
		t.Errorf("second wid: got %d, want 2", wid2)
	}
}

func TestRegisterFixedWriter_RejectsAfterCleanup(t *testing.T) {
	ws := New()
	ws.Cleanup()
	_, err := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(4194304), 4194304, false)
	if err == nil {
		t.Error("expected error registering after cleanup, got nil")
	}
}

// ---- RegisterFixedChunk ----

func TestRegisterFixedChunk_AddsToKnownChunks(t *testing.T) {
	ws := New()
	wid, _ := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(4194304), 4194304, false)
	var digest [32]byte
	digest[0] = 0xab
	if err := ws.RegisterFixedChunk(wid, digest, 4194304, false); err != nil {
		t.Fatal(err)
	}
	size, ok := ws.LookupChunk(digest)
	if !ok {
		t.Fatal("chunk not found in knownChunks")
	}
	if size != 4194304 {
		t.Errorf("size: got %d, want 4194304", size)
	}
}

func TestRegisterFixedChunk_RejectsOversize(t *testing.T) {
	ws := New()
	wid, _ := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(8388608), 4194304, false)
	var digest [32]byte
	err := ws.RegisterFixedChunk(wid, digest, 4194305, false) // one byte over
	if err == nil {
		t.Error("expected error for oversized chunk, got nil")
	}
}

func TestRegisterFixedChunk_AllowsOneSmallChunk(t *testing.T) {
	ws := New()
	wid, _ := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(5*1024*1024), 4194304, false)
	var d1 [32]byte
	d1[0] = 1
	if err := ws.RegisterFixedChunk(wid, d1, 4194304, false); err != nil {
		t.Fatalf("full chunk: %v", err)
	}
	var d2 [32]byte
	d2[0] = 2
	if err := ws.RegisterFixedChunk(wid, d2, 1048576, false); err != nil { // 1 MiB < 4 MiB
		t.Fatalf("small last chunk: %v", err)
	}
}

func TestRegisterFixedChunk_RejectsMultipleSmallChunks(t *testing.T) {
	ws := New()
	wid, _ := ws.RegisterFixedWriter("a.fidx", &fakeFidx{}, ptrU64(8*1024*1024), 4194304, false)
	for i := 0; i < 2; i++ {
		var d [32]byte
		d[0] = byte(i + 1)
		_ = ws.RegisterFixedChunk(wid, d, 1, false) // 1 byte < chunk_size
	}
	var d3 [32]byte
	d3[0] = 3
	err := ws.RegisterFixedChunk(wid, d3, 1, false)
	if err == nil {
		t.Error("expected error for third small chunk, got nil")
	}
}

// ---- FixedWriterAppendChunk ----

func TestFixedWriterAppendChunk_IncrementsChunkCount(t *testing.T) {
	ws := New()
	fi := &fakeFidx{}
	wid, _ := ws.RegisterFixedWriter("a.fidx", fi, ptrU64(4194304), 4194304, false)

	var digest [32]byte
	if err := ws.FixedWriterAppendChunk(wid, 4194304, 4194304, digest); err != nil {
		t.Fatal(err)
	}
	// ChunkCount is not exported, but we can verify via FixedWriterClose validation.
	// Here we just check there's no error and the fakeFidx received the call.
	if len(fi.chunks) != 1 {
		t.Errorf("expected 1 chunk in fakeFidx, got %d", len(fi.chunks))
	}
	if fi.chunks[0].offset != 4194304 {
		t.Errorf("offset: got %d, want 4194304", fi.chunks[0].offset)
	}
}

func TestFixedWriterAppendChunk_PropagatesAddChunkError(t *testing.T) {
	ws := New()
	want := errors.New("disk full")
	ef := &errFidx{addErr: want}
	wid, _ := ws.RegisterFixedWriter("a.fidx", ef, ptrU64(4194304), 4194304, false)

	var digest [32]byte
	err := ws.FixedWriterAppendChunk(wid, 4194304, 4194304, digest)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, want) {
		t.Errorf("error chain: got %v, want to contain %v", err, want)
	}
}

// ---- FixedWriterClose ----

func TestFixedWriterClose_HappyPath(t *testing.T) {
	ws := New()
	var expectedCsum [32]byte
	for i := range expectedCsum {
		expectedCsum[i] = byte(i)
	}
	fi := &fakeFidx{closeReturn: expectedCsum}
	size := uint64(4194304)
	wid, _ := ws.RegisterFixedWriter("a.fidx", fi, &size, 4194304, false)

	var digest [32]byte
	_ = ws.FixedWriterAppendChunk(wid, 4194304, 4194304, digest)

	got, err := ws.FixedWriterClose(wid, 1, size, expectedCsum)
	if err != nil {
		t.Fatal(err)
	}
	if got != expectedCsum {
		t.Errorf("returned csum mismatch")
	}
}

func TestFixedWriterClose_ChunkCountMismatch(t *testing.T) {
	ws := New()
	fi := &fakeFidx{}
	size := uint64(4194304)
	wid, _ := ws.RegisterFixedWriter("a.fidx", fi, &size, 4194304, false)
	// No AppendChunk calls — server count is 0, client claims 1.
	_, err := ws.FixedWriterClose(wid, 1, size, [32]byte{})
	if err == nil {
		t.Error("expected error for chunk count mismatch, got nil")
	}
}

func TestFixedWriterClose_CsumMismatch(t *testing.T) {
	ws := New()
	var serverCsum [32]byte
	serverCsum[0] = 0xAA
	fi := &fakeFidx{closeReturn: serverCsum}
	size := uint64(0)
	wid, _ := ws.RegisterFixedWriter("a.fidx", fi, &size, 4194304, false)
	// 0 chunks, 0 size — valid close but wrong csum from client.
	var wrongCsum [32]byte
	wrongCsum[0] = 0xBB
	_, err := ws.FixedWriterClose(wid, 0, 0, wrongCsum)
	if err == nil {
		t.Error("expected error for csum mismatch, got nil")
	}
	if !strings.Contains(err.Error(), "csum") {
		t.Errorf("error should mention csum, got: %v", err)
	}
}

// ---- Cleanup ----

func TestCleanup_DropsOpenWriters(t *testing.T) {
	ws := New()
	fi := &fakeFidx{}
	_, _ = ws.RegisterFixedWriter("open.fidx", fi, ptrU64(4194304), 4194304, false)
	ws.Cleanup()
	if !fi.dropCalled {
		t.Error("Drop not called on open writer during Cleanup")
	}
}

func TestCleanup_SkipsClosedWriters(t *testing.T) {
	ws := New()
	fi := &fakeFidx{} // closeReturn is zero [32]byte
	size := uint64(0)
	wid, _ := ws.RegisterFixedWriter("closed.fidx", fi, &size, 4194304, false)
	// Close with 0 chunks, 0 size, zero csum (matches fi.closeReturn).
	if _, err := ws.FixedWriterClose(wid, 0, 0, [32]byte{}); err != nil {
		t.Fatalf("close: %v", err)
	}
	ws.Cleanup()
	if fi.dropCalled {
		t.Error("Drop called on already-closed writer during Cleanup")
	}
}

func TestCleanup_RejectsSubsequentRegistration(t *testing.T) {
	ws := New()
	ws.Cleanup()
	_, err := ws.RegisterFixedWriter("new.fidx", &fakeFidx{}, ptrU64(4194304), 4194304, false)
	if err == nil {
		t.Error("expected error registering after Cleanup, got nil")
	}
}
