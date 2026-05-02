package dynamicindex

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
