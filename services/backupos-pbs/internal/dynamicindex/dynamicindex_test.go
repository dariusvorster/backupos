package dynamicindex

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	didxpkg "github.com/dariusvorster/backupos/services/backupos-pbs/internal/didx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/wstate"
)

func injectCtx(sc *streamctx.SessionContext) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(streamctx.WithSession(r.Context(), sc)))
		})
	}
}

func makeSessionCtx(datastoreRoot string) *streamctx.SessionContext {
	return &streamctx.SessionContext{
		SessionID:     "test-session",
		DatastoreID:   "ds-1",
		DatastoreRoot: datastoreRoot,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0).UTC(),
		WriterState:   wstate.New(),
	}
}

// writeDidxFile writes a minimal valid .didx file with the given entries and
// returns the index_csum as a lowercase hex string.
func writeDidxFile(t *testing.T, path string, entries []didxpkg.ChunkRef) string {
	t.Helper()
	h := sha256.New()
	for _, e := range entries {
		var end [8]byte
		binary.LittleEndian.PutUint64(end[:], e.End)
		h.Write(end[:])
		h.Write(e.Digest[:])
	}
	var csum [32]byte
	copy(csum[:], h.Sum(nil))

	hdr := make([]byte, 4096)
	copy(hdr[0:8], didxpkg.Magic[:])
	copy(hdr[32:64], csum[:])

	body := make([]byte, len(entries)*40)
	for i, e := range entries {
		binary.LittleEndian.PutUint64(body[i*40:], e.End)
		copy(body[i*40+8:], e.Digest[:])
	}
	if err := os.WriteFile(path, append(hdr, body...), 0o644); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(csum[:])
}

func TestHandler_MissingArchiveName_Returns400(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodPost, "/dynamic_index", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandler_BadExtension_Returns400(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodPost, "/dynamic_index?archive-name=drive.fidx", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for .fidx name, got %d", rr.Code)
	}
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodGet, "/dynamic_index?archive-name=pxar.didx", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandler_ValidRequest_Returns200WithWid(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	req := httptest.NewRequest(http.MethodPost, "/dynamic_index?archive-name=drive-scsi0.img.didx", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		Data int `json:"data"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Data < 1 || resp.Data > 256 {
		t.Errorf("wid out of range: %d", resp.Data)
	}
}

func TestHandler_ArchiveNameTooLong_Returns400(t *testing.T) {
	dir := t.TempDir()
	h := injectCtx(makeSessionCtx(dir))(NewHandler())

	// 65-char base + .didx = 70 chars total, over the 64-char limit
	longName := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.didx"
	req := httptest.NewRequest(http.MethodPost, "/dynamic_index?archive-name="+longName, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

// ---- reuse-csum tests ----

func TestDynamicIndex_ReuseCsum_NoPrevious_Returns400(t *testing.T) {
	dir := t.TempDir()
	sc := makeSessionCtx(dir) // PreviousBackup is nil
	h := injectCtx(sc)(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_index?archive-name=pxar.didx&reuse-csum="+hex.EncodeToString(make([]byte, 32)), nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDynamicIndex_ReuseCsum_InvalidHex_Returns400(t *testing.T) {
	dir := t.TempDir()
	prevDir := t.TempDir()
	sc := makeSessionCtx(dir)
	sc.PreviousBackup = &previous.Snapshot{Path: prevDir, Time: time.Now()}
	h := injectCtx(sc)(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_index?archive-name=pxar.didx&reuse-csum=notvalidhex", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestDynamicIndex_ReuseCsum_CsumMismatch_Returns400(t *testing.T) {
	dir := t.TempDir()
	prevDir := t.TempDir()

	// Write a real .didx in prevDir.
	entries := []didxpkg.ChunkRef{{End: 1048576, Digest: [32]byte{0: 0xAA}}}
	writeDidxFile(t, filepath.Join(prevDir, "pxar.didx"), entries)

	sc := makeSessionCtx(dir)
	sc.PreviousBackup = &previous.Snapshot{Path: prevDir, Time: time.Now()}
	h := injectCtx(sc)(NewHandler())

	wrongCsum := hex.EncodeToString(make([]byte, 32)) // all-zero csum won't match
	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_index?archive-name=pxar.didx&reuse-csum="+wrongCsum, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDynamicIndex_ReuseCsum_PreviousArchiveMissing_Returns400(t *testing.T) {
	dir := t.TempDir()
	prevDir := t.TempDir() // empty — no .didx file

	sc := makeSessionCtx(dir)
	sc.PreviousBackup = &previous.Snapshot{Path: prevDir, Time: time.Now()}
	h := injectCtx(sc)(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_index?archive-name=pxar.didx&reuse-csum="+hex.EncodeToString(make([]byte, 32)), nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDynamicIndex_ReuseCsum_ValidPrevious_RegistersChunks(t *testing.T) {
	dir := t.TempDir()
	prevDir := t.TempDir()

	d1 := [32]byte{0: 0xBB}
	d2 := [32]byte{0: 0xCC}
	entries := []didxpkg.ChunkRef{
		{End: 1048576, Digest: d1},
		{End: 3145728, Digest: d2},
	}
	csumHex := writeDidxFile(t, filepath.Join(prevDir, "pxar.didx"), entries)

	ws := wstate.New()
	sc := &streamctx.SessionContext{
		SessionID:      "test-session",
		DatastoreID:    "ds-1",
		DatastoreRoot:  dir,
		BackupType:     "vm",
		BackupID:       "100",
		BackupTime:     time.Unix(1735000000, 0).UTC(),
		WriterState:    ws,
		PreviousBackup: &previous.Snapshot{Path: prevDir, Time: time.Now()},
	}
	h := injectCtx(sc)(NewHandler())

	req := httptest.NewRequest(http.MethodPost,
		"/dynamic_index?archive-name=pxar.didx&reuse-csum="+csumHex, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	for _, e := range entries {
		if _, ok := ws.LookupChunk(e.Digest); !ok {
			t.Errorf("digest %x not in knownChunks after reuse-csum", e.Digest[:2])
		}
	}
}
