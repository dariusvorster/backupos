package blob

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

func makeReq(t *testing.T, dataRoot string, query, body string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/blob?"+query, strings.NewReader(body))
	r = r.WithContext(streamctx.WithSession(r.Context(), &streamctx.SessionContext{
		SessionID:     "sess-test",
		DatastoreID:   "ds-test",
		DatastoreRoot: dataRoot,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0),
	}))
	return r
}

func TestHandler_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	h := NewHandler()
	body := "the body bytes"
	r := makeReq(t, tmp, "file-name=test.blob&encoded-size=14", body)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	wrote, err := os.ReadFile(filepath.Join(tmp, "vm", "100", "2024-12-24T00:26:40Z", "test.blob"))
	if err != nil {
		t.Fatalf("blob not written: %v", err)
	}
	if string(wrote) != body {
		t.Errorf("body mismatch: got %q, want %q", string(wrote), body)
	}
}

func TestHandler_ResponseShape(t *testing.T) {
	tmp := t.TempDir()
	h := NewHandler()
	r := makeReq(t, tmp, "file-name=test.blob&encoded-size=4", "abcd")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v body=%q", err, w.Body.String())
	}
	if v, ok := resp["data"]; !ok || v != nil {
		t.Errorf(`expected {"data":null}, got %v`, resp)
	}
}

func TestHandler_GETReturns405(t *testing.T) {
	h := NewHandler()
	r := httptest.NewRequest(http.MethodGet, "/blob", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandler_MissingStreamCtx(t *testing.T) {
	h := NewHandler()
	r := httptest.NewRequest(http.MethodPost, "/blob?file-name=t.blob&encoded-size=0", strings.NewReader(""))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 without streamctx, got %d", w.Code)
	}
}

func TestHandler_ParamValidation(t *testing.T) {
	cases := []struct {
		name  string
		query string
		body  string
	}{
		{"missing file-name", "encoded-size=4", "abcd"},
		{"missing encoded-size", "file-name=t.blob", "abcd"},
		{"file-name without .blob", "file-name=t.txt&encoded-size=4", "abcd"},
		{"file-name with traversal", "file-name=../escape.blob&encoded-size=4", "abcd"},
		{"file-name with slash", "file-name=sub%2Fx.blob&encoded-size=4", "abcd"},
		{"encoded-size negative", "file-name=t.blob&encoded-size=-1", ""},
		{"encoded-size not integer", "file-name=t.blob&encoded-size=abc", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tmp := t.TempDir()
			h := NewHandler()
			r := makeReq(t, tmp, tc.query, tc.body)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400, got %d. Body: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestHandler_SizeMismatch(t *testing.T) {
	tmp := t.TempDir()
	h := NewHandler()
	// Body is 4 bytes but encoded-size says 10
	r := makeReq(t, tmp, "file-name=t.blob&encoded-size=10", "abcd")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Verify no partial blob or temp file was left behind
	snapDir := filepath.Join(tmp, "vm", "100", "2024-12-24T00:26:40Z")
	entries, _ := os.ReadDir(snapDir)
	for _, e := range entries {
		if e.Name() == "t.blob" {
			t.Errorf("blob was kept despite size mismatch")
		}
		if strings.Contains(e.Name(), ".tmp.") {
			t.Errorf("temp file leaked: %s", e.Name())
		}
	}
}

func TestHandler_AtomicWrite(t *testing.T) {
	// After a successful POST, exactly one file (the blob) with no .tmp.* leftover.
	tmp := t.TempDir()
	h := NewHandler()
	r := makeReq(t, tmp, "file-name=qemu-server.conf.blob&encoded-size=14", "the body bytes")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	snapDir := filepath.Join(tmp, "vm", "100", "2024-12-24T00:26:40Z")
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("expected 1 file in snapshot dir, got %d: %v", len(entries), names)
	}
	if entries[0].Name() != "qemu-server.conf.blob" {
		t.Errorf("expected qemu-server.conf.blob, got %s", entries[0].Name())
	}
}

func TestHandler_LargeBlob(t *testing.T) {
	// Stream a multi-MB body to ensure we don't buffer in memory.
	tmp := t.TempDir()
	h := NewHandler()
	const size = 5 * 1024 * 1024 // 5 MiB
	body := bytes.Repeat([]byte{0xAB}, size)
	r := httptest.NewRequest(http.MethodPost,
		"/blob?file-name=big.blob&encoded-size="+strconv.Itoa(size),
		bytes.NewReader(body))
	r = r.WithContext(streamctx.WithSession(r.Context(), &streamctx.SessionContext{
		SessionID:     "sess-big",
		DatastoreRoot: tmp,
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0),
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	written, err := os.ReadFile(filepath.Join(tmp, "vm", "100", "2024-12-24T00:26:40Z", "big.blob"))
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != size {
		t.Errorf("size: got %d, want %d", len(written), size)
	}
	if !bytes.Equal(written[:1024], body[:1024]) || !bytes.Equal(written[size-1024:], body[size-1024:]) {
		t.Error("content corrupted in transit")
	}
}
