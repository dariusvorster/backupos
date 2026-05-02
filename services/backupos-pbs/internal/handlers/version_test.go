package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVersionHandler_GET(t *testing.T) {
	h := NewVersionHandler(VersionInfo{
		Version: "4.0.0",
		Release: "1",
		RepoID:  "backupos",
	})

	req := httptest.NewRequest(http.MethodGet, "/api2/json/version", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if got := w.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("expected JSON content-type, got %q", got)
	}

	var resp struct {
		Data VersionInfo `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.Data.Version != "4.0.0" {
		t.Errorf("expected version=4.0.0, got %q", resp.Data.Version)
	}
	if resp.Data.Release != "1" {
		t.Errorf("expected release=1, got %q", resp.Data.Release)
	}
	if resp.Data.RepoID != "backupos" {
		t.Errorf("expected repoid=backupos, got %q", resp.Data.RepoID)
	}
}

func TestVersionHandler_PostRejected(t *testing.T) {
	h := NewVersionHandler(VersionInfo{Version: "4.0.0", Release: "1", RepoID: "backupos"})
	req := httptest.NewRequest(http.MethodPost, "/api2/json/version", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST, got %d", w.Code)
	}
}
