package previoustime

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/previous"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

func TestPreviousTime_MethodNotAllowed(t *testing.T) {
	h := NewHandler()
	r := httptest.NewRequest(http.MethodPost, "/previous_backup_time", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), &streamctx.SessionContext{}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestPreviousTime_NoStreamCtx_Returns500(t *testing.T) {
	h := NewHandler()
	r := httptest.NewRequest(http.MethodGet, "/previous_backup_time", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

func TestPreviousTime_NoPrevious_ReturnsNull(t *testing.T) {
	h := NewHandler()
	sc := &streamctx.SessionContext{PreviousBackup: nil}
	r := httptest.NewRequest(http.MethodGet, "/previous_backup_time", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["data"] != nil {
		t.Errorf("expected data=null, got %v", body["data"])
	}
}

func TestPreviousTime_WithPrevious_ReturnsUnixTimestamp(t *testing.T) {
	ts, _ := time.Parse(time.RFC3339, "2025-01-01T00:00:00Z")
	h := NewHandler()
	sc := &streamctx.SessionContext{
		PreviousBackup: &previous.Snapshot{Time: ts},
	}
	r := httptest.NewRequest(http.MethodGet, "/previous_backup_time", nil)
	r = r.WithContext(streamctx.WithSession(r.Context(), sc))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	got, ok := body["data"].(float64)
	if !ok {
		t.Fatalf("expected numeric data, got %T %v", body["data"], body["data"])
	}
	if int64(got) != ts.Unix() {
		t.Errorf("timestamp: got %d, want %d", int64(got), ts.Unix())
	}
}
