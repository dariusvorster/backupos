package speedtest

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func callHandler(t *testing.T, method string) *httptest.ResponseRecorder {
	t.Helper()
	h := Handler()
	req := httptest.NewRequest(method, "/speedtest", nil)
	w := httptest.NewRecorder()
	h(w, req)
	return w
}

func TestHandler_ReturnsExactly1MiB(t *testing.T) {
	w := callHandler(t, http.MethodGet)
	body, err := io.ReadAll(w.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if len(body) != BlockSize {
		t.Errorf("body length: got %d, want %d", len(body), BlockSize)
	}
}

func TestHandler_AllZeros(t *testing.T) {
	w := callHandler(t, http.MethodGet)
	body, _ := io.ReadAll(w.Body)
	for i, b := range body {
		if b != 0 {
			t.Errorf("non-zero byte at offset %d: got %d", i, b)
			return
		}
	}
}

func TestHandler_ContentLength(t *testing.T) {
	w := callHandler(t, http.MethodGet)
	got := w.Header().Get("Content-Length")
	if got != "1048576" {
		t.Errorf("Content-Length: got %q, want %q", got, "1048576")
	}
}

func TestHandler_OctetStream(t *testing.T) {
	w := callHandler(t, http.MethodGet)
	got := w.Header().Get("Content-Type")
	if got != "application/octet-stream" {
		t.Errorf("Content-Type: got %q, want %q", got, "application/octet-stream")
	}
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		w := callHandler(t, method)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("method %s: got %d, want 405", method, w.Code)
		}
	}
}
