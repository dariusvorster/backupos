package fixedchunk

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datablob"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

func injectCtx(sc *streamctx.SessionContext, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
	})
}

// setupSC creates a SessionContext with a wstate that has one registered writer.
// Returns the sc, the wid, and the datastore root.
func setupSC(t *testing.T) (*streamctx.SessionContext, int, string) {
	t.Helper()
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, ".chunks"), 0o755)

	ws := wstate.New()
	// fakeFidx for wstate — we need a FixedIndexWriter interface impl.
	// We use a minimal anonymous struct via adapter below.
	fi := &testFidx{}
	size := uint64(4 * 1024 * 1024)
	wid, err := ws.RegisterFixedWriter("drive-0.fidx", fi, &size, 4*1024*1024, false)
	if err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID:     "sess-test",
		DatastoreRoot: root,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0),
		WriterState:   ws,
	}
	return sc, wid, root
}

// testFidx is a no-op FixedIndexWriter for handler tests.
type testFidx struct{}

func (f *testFidx) AddChunk(_ uint64, _ uint32, _ [32]byte) error { return nil }
func (f *testFidx) IndexLength() uint64                           { return 0 }
func (f *testFidx) Close() ([32]byte, error)                      { return [32]byte{}, nil }
func (f *testFidx) UUID() [16]byte                                { return [16]byte{} }
func (f *testFidx) Drop()                                         {}

// makeBlob builds an uncompressed DataBlob from data.
func makeBlob(data []byte) []byte {
	blob := make([]byte, 12+len(data))
	copy(blob[0:8], datablob.MagicUncompressed[:])
	copy(blob[12:], data)
	return blob
}

func TestFixedChunk_WrongMethod_Returns405(t *testing.T) {
	sc, _, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/fixed_chunk", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestFixedChunk_MissingStreamCtx_Returns500(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/fixed_chunk", "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestFixedChunk_MissingParams_Returns400(t *testing.T) {
	sc, _, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	// No query params at all.
	resp, err := http.Post(srv.URL+"/fixed_chunk", "", nil)
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing params, got %d", resp.StatusCode)
	}
}

func TestFixedChunk_BadDigestHex_Returns400(t *testing.T) {
	sc, wid, _ := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	url := fmt.Sprintf("%s/fixed_chunk?wid=%d&digest=notvalidhex&size=4&encoded-size=16", srv.URL, wid)
	resp, err := http.Post(url, "application/octet-stream", bytes.NewReader(make([]byte, 16)))
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for bad digest, got %d", resp.StatusCode)
	}
}

func TestFixedChunk_DigestMismatch_Returns400(t *testing.T) {
	sc, wid, root := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	payload := []byte("test payload")
	blob := makeBlob(payload)
	realDigest := sha256.Sum256(payload)

	// Create shard dir for real digest.
	prefix := hex.EncodeToString(realDigest[:])[:4]
	_ = os.MkdirAll(filepath.Join(root, ".chunks", prefix), 0o755)

	// Claim a WRONG digest.
	var wrongDigest [32]byte
	wrongDigest[0] = 0xFF
	url := fmt.Sprintf("%s/fixed_chunk?wid=%d&digest=%s&size=%d&encoded-size=%d",
		srv.URL, wid, hex.EncodeToString(wrongDigest[:]), len(payload), len(blob))
	resp, err := http.Post(url, "application/octet-stream", bytes.NewReader(blob))
	if err != nil {
		t.Fatalf("Post failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for digest mismatch, got %d", resp.StatusCode)
	}
}

func TestFixedChunk_HappyPath(t *testing.T) {
	sc, wid, root := setupSC(t)
	srv := httptest.NewServer(injectCtx(sc, NewHandler()))
	defer srv.Close()

	payload := []byte("chunk payload for happy path test")
	blob := makeBlob(payload)
	digest := sha256.Sum256(payload)
	digestHex := hex.EncodeToString(digest[:])

	// Pre-create the shard dir for this digest.
	prefix := digestHex[:4]
	_ = os.MkdirAll(filepath.Join(root, ".chunks", prefix), 0o755)

	url := fmt.Sprintf("%s/fixed_chunk?wid=%d&digest=%s&size=%d&encoded-size=%d",
		srv.URL, wid, digestHex, len(payload), len(blob))
	resp, err := http.Post(url, "application/octet-stream", bytes.NewReader(blob))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// Chunk must be registered in known_chunks.
	size, ok := sc.WriterState.LookupChunk(digest)
	if !ok {
		t.Error("chunk not registered in known_chunks after upload")
	}
	if size != uint32(len(payload)) {
		t.Errorf("known_chunks size: got %d, want %d", size, len(payload))
	}

	// Chunk file must exist on disk.
	chunkPath := filepath.Join(root, ".chunks", prefix, digestHex)
	if _, err := os.Stat(chunkPath); err != nil {
		t.Errorf("chunk file not found on disk: %v", err)
	}
}
