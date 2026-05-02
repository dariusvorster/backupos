package finish

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

func setupTestStore(t *testing.T) (*sql.DB, *session.Store) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_active_sessions (
			id            TEXT PRIMARY KEY,
			token_id      TEXT,
			datastore_id  TEXT,
			backup_type   TEXT NOT NULL,
			backup_id     TEXT NOT NULL,
			backup_time   INTEGER NOT NULL,
			started_at    INTEGER NOT NULL,
			state         TEXT NOT NULL,
			scratch_path  TEXT,
			namespace      TEXT NOT NULL DEFAULT ''
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db, session.NewStore(db)
}

func makeReq(t *testing.T, sc *streamctx.SessionContext) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/finish", nil)
	if sc != nil {
		r = r.WithContext(streamctx.WithSession(context.Background(), sc))
	}
	return r
}

func TestHandler_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	db, store := setupTestStore(t)
	h := NewHandler(store)

	id, err := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	if err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreID: "ds-1", DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if v, ok := resp["data"]; !ok || v != nil {
		t.Errorf(`expected {"data":null}, got %v`, resp)
	}

	var gotState string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions WHERE id = ?`, id).Scan(&gotState)
	if gotState != "finished" {
		t.Errorf("state: got %q, want finished", gotState)
	}
}

func TestHandler_GETReturns405(t *testing.T) {
	_, store := setupTestStore(t)
	h := NewHandler(store)
	r := httptest.NewRequest(http.MethodGet, "/finish", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestHandler_MissingStreamCtx(t *testing.T) {
	_, store := setupTestStore(t)
	h := NewHandler(store)
	r := httptest.NewRequest(http.MethodPost, "/finish", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 without streamctx, got %d", w.Code)
	}
}

func TestHandler_DoubleFinishRejected(t *testing.T) {
	tmp := t.TempDir()
	_, store := setupTestStore(t)
	h := NewHandler(store)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}

	w1 := httptest.NewRecorder()
	h.ServeHTTP(w1, makeReq(t, sc))
	if w1.Code != http.StatusOK {
		t.Fatalf("first finish: expected 200, got %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, makeReq(t, sc))
	if w2.Code != http.StatusBadRequest {
		t.Errorf("second finish: expected 400, got %d. Body: %s", w2.Code, w2.Body.String())
	}
	if !strings.Contains(w2.Body.String(), "not active") {
		t.Errorf("expected 'not active' in response, got %s", w2.Body.String())
	}
}

func TestHandler_FinishOnAbortedSessionRejected(t *testing.T) {
	tmp := t.TempDir()
	_, store := setupTestStore(t)
	h := NewHandler(store)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	if _, err := store.Finalize(id); err != nil {
		t.Fatal(err)
	}

	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_NoSnapshotDirIsOK(t *testing.T) {
	tmp := t.TempDir()
	_, store := setupTestStore(t)
	h := NewHandler(store)

	id, _ := store.Begin(session.BeginParams{
		TokenID: "tok-1", DatastoreID: "ds-1",
		BackupType: "vm", BackupID: "100",
		BackupTime: time.Unix(1735000000, 0), Kind: session.KindBackup,
	})
	sc := &streamctx.SessionContext{
		SessionID: id, DatastoreRoot: tmp,
		BackupType: "vm", BackupID: "100", BackupTime: time.Unix(1735000000, 0),
	}
	// Do NOT create the snapshot dir — finish should still return 200
	w := httptest.NewRecorder()
	h.ServeHTTP(w, makeReq(t, sc))
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 even without snapshot dir, got %d. Body: %s", w.Code, w.Body.String())
	}
}
