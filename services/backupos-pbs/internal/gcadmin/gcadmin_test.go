package gcadmin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcrun"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gctask"
)

// ---- test infrastructure ----

func setupDB(t *testing.T, dsName, dsPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL UNIQUE,
			path       TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(
		`INSERT INTO pbs_datastores (id, name, path, created_at) VALUES (?, ?, ?, ?)`,
		"ds-test-id", dsName, dsPath, time.Now().UnixMilli(),
	)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func makeDSRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".chunks"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

func noWriter(_ context.Context) (time.Time, error) { return time.Time{}, nil }

func newHandler(t *testing.T, db *sql.DB, runFn func(context.Context, string, gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error)) *Handler {
	t.Helper()
	h := NewHandler(datastore.NewLookup(db), gctask.NewTracker(), noWriter)
	if runFn != nil {
		h.runFn = runFn
	}
	return h
}

func doRequest(t *testing.T, h *Handler, method, path string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Result()
}

func readBody(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("parse body: %v\nbody: %s", err, b)
	}
	return out
}

// ---- tests ----

func TestPOST_Returns202WithTaskID(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	done := make(chan struct{})
	h := newHandler(t, db, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		close(done)
		return &gcstatus.Status{}, nil
	})

	resp := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status: got %d, want 202", resp.StatusCode)
	}
	body := readBody(t, resp)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %v", body["data"])
	}
	taskID, _ := data["task_id"].(string)
	if taskID == "" {
		t.Error("expected non-empty task_id")
	}
	if data["state"] != "running" {
		t.Errorf("state: got %v, want running", data["state"])
	}

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Error("runFn never called")
	}
}

func TestGET_BeforeRun_ReturnsNullData(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)
	h := newHandler(t, db, nil) // runFn won't be called

	resp := doRequest(t, h, http.MethodGet, "/api2/json/admin/datastore/mystore/gc")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: got %d, want 200", resp.StatusCode)
	}
	body := readBody(t, resp)
	if body["data"] != nil {
		t.Errorf("expected data=null, got %v", body["data"])
	}
}

func TestTwoPOSTs_SecondReturns409(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	blocking := make(chan struct{})
	h := newHandler(t, db, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		<-blocking // block until test releases
		return &gcstatus.Status{}, nil
	})

	// First POST: should be 202.
	resp1 := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	if resp1.StatusCode != http.StatusAccepted {
		t.Fatalf("first POST: got %d, want 202", resp1.StatusCode)
	}

	// Second POST while first is still running: should be 409.
	resp2 := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	if resp2.StatusCode != http.StatusConflict {
		t.Errorf("second POST: got %d, want 409", resp2.StatusCode)
	}

	close(blocking) // let goroutine finish
}

func TestPOST_AfterFirstCompletes_Succeeds(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	done := make(chan struct{})
	h := newHandler(t, db, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		close(done)
		return &gcstatus.Status{}, nil
	})

	resp1 := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	if resp1.StatusCode != http.StatusAccepted {
		t.Fatalf("first POST: %d", resp1.StatusCode)
	}
	<-done // wait for goroutine to finish

	// Replace runFn to capture the second task's completion.
	done2 := make(chan struct{})
	h.runFn = func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		close(done2)
		return &gcstatus.Status{}, nil
	}

	resp2 := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	if resp2.StatusCode != http.StatusAccepted {
		t.Errorf("second POST after completion: got %d, want 202", resp2.StatusCode)
	}
	<-done2
}

func TestGET_AfterSucceeded_ShowsSucceeded(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	done := make(chan struct{})
	h := newHandler(t, db, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		defer close(done)
		return &gcstatus.Status{DiskChunks: 7, RemovedChunks: 2}, nil
	})

	doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	<-done // wait for goroutine to call Succeed

	resp := doRequest(t, h, http.MethodGet, "/api2/json/admin/datastore/mystore/gc")
	body := readBody(t, resp)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %v", body["data"])
	}
	if data["state"] != "succeeded" {
		t.Errorf("state: got %v, want succeeded", data["state"])
	}
}

func TestGET_AfterFailed_ShowsFailed(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	done := make(chan struct{})
	h := newHandler(t, db, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		defer close(done)
		return nil, errors.New("atime probe failed")
	})

	doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	<-done

	resp := doRequest(t, h, http.MethodGet, "/api2/json/admin/datastore/mystore/gc")
	body := readBody(t, resp)
	data := body["data"].(map[string]any)
	if data["state"] != "failed" {
		t.Errorf("state: got %v, want failed", data["state"])
	}
	if data["error"] == "" {
		t.Error("expected non-empty error field")
	}
}

func TestWrongMethod_Returns405(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)
	h := newHandler(t, db, nil)

	resp := doRequest(t, h, http.MethodPut, "/api2/json/admin/datastore/mystore/gc")
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: got %d, want 405", resp.StatusCode)
	}
}

func TestUnknownDatastore_Returns400(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)
	h := newHandler(t, db, nil)

	resp := doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/nonexistent/gc")
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: got %d, want 400", resp.StatusCode)
	}
}

func TestInvalidPath_Returns400(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)
	h := newHandler(t, db, nil)

	for _, path := range []string{
		"/api2/json/admin/datastore//gc",
		"/api2/json/admin/datastore/mystore",
		"/api2/json/admin/datastore/mystore/gc/extra",
	} {
		resp := doRequest(t, h, http.MethodPost, path)
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("path %q: got %d, want 400", path, resp.StatusCode)
		}
	}
}

func TestExtractStore(t *testing.T) {
	cases := []struct {
		path    string
		want    string
		wantOK  bool
	}{
		{"/api2/json/admin/datastore/mystore/gc", "mystore", true},
		{"/api2/json/admin/datastore/my-store_2/gc", "my-store_2", true},
		{"/api2/json/admin/datastore//gc", "", false},
		{"/api2/json/admin/datastore/mystore", "", false},
		{"/api2/json/admin/datastore/a/b/gc", "", false},
		{"/api2/json/admin/", "", false},
	}
	for _, tc := range cases {
		got, ok := extractStore(tc.path)
		if ok != tc.wantOK || got != tc.want {
			t.Errorf("extractStore(%q) = (%q, %v), want (%q, %v)", tc.path, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestGCRunsWithBackgroundContext_ClientDisconnectDoesNotCancel(t *testing.T) {
	root := makeDSRoot(t)
	db := setupDB(t, "mystore", root)

	var capturedCtx context.Context
	done := make(chan struct{})
	h := newHandler(t, db, func(ctx context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		capturedCtx = ctx
		close(done)
		return &gcstatus.Status{}, nil
	})

	doRequest(t, h, http.MethodPost, "/api2/json/admin/datastore/mystore/gc")
	<-done

	if capturedCtx == nil {
		t.Fatal("context was nil")
	}
	// The goroutine must use context.Background(), not the request context.
	// context.Background() never cancels.
	select {
	case <-capturedCtx.Done():
		t.Error("context was cancelled — must use context.Background()")
	default:
	}
}
