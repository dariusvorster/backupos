package upgrade

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/net/http2"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/blob"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dynamicappend"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dynamicchunk"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dynamicclose"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dynamicindex"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/finish"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fixedappend"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fixedchunk"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fixedclose"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/fixedindex"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/session"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL UNIQUE,
			path         TEXT NOT NULL,
			created_at   INTEGER NOT NULL,
			prune_schedule TEXT, gc_schedule TEXT, gc_schedule_interval TEXT, last_gc_at INTEGER,
			total_size_bytes INTEGER, unique_size_bytes INTEGER, chunk_count INTEGER
		);
		INSERT INTO pbs_datastores (id, name, path, created_at)
		VALUES ('test-ds-1', 'default', '/tmp/test-ds', 1735000000000);

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

		CREATE TABLE backup_jobs (
			id TEXT PRIMARY KEY,
			name TEXT, source_type TEXT, source_config TEXT,
			schedule TEXT, enabled INTEGER, preflight_enabled INTEGER, created_at INTEGER,
			last_run_at INTEGER, last_run_status TEXT
		);
		CREATE TABLE backup_runs (
			id TEXT PRIMARY KEY, job_id TEXT, status TEXT, trigger TEXT,
			started_at INTEGER, run_type TEXT,
			completed_at INTEGER, duration INTEGER, snapshot_id TEXT, error_message TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func setupTestDBAtPath(t *testing.T, dsPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(1)

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL UNIQUE,
			path         TEXT NOT NULL,
			created_at   INTEGER NOT NULL,
			prune_schedule TEXT, gc_schedule TEXT, gc_schedule_interval TEXT, last_gc_at INTEGER,
			total_size_bytes INTEGER, unique_size_bytes INTEGER, chunk_count INTEGER
		);
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

		CREATE TABLE backup_jobs (
			id TEXT PRIMARY KEY,
			name TEXT, source_type TEXT, source_config TEXT,
			schedule TEXT, enabled INTEGER, preflight_enabled INTEGER, created_at INTEGER,
			last_run_at INTEGER, last_run_status TEXT
		);
		CREATE TABLE backup_runs (
			id TEXT PRIMARY KEY, job_id TEXT, status TEXT, trigger TEXT,
			started_at INTEGER, run_type TEXT,
			completed_at INTEGER, duration INTEGER, snapshot_id TEXT, error_message TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`INSERT INTO pbs_datastores (id, name, path, created_at) VALUES ('test-ds-1', 'default', ?, 1735000000000)`,
		dsPath,
	); err != nil {
		t.Fatal(err)
	}
	return db
}

// do101 sends a raw HTTP/1.1 upgrade request to addr and reads until it
// receives the complete 101 response header block. Returns the header text.
func do101(t *testing.T, addr, host, query string) string {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	req := "GET " + query + " HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + UpgradeToken + "\r\n" +
		"\r\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		t.Fatalf("write: %v", err)
	}

	buf := make([]byte, 4096)
	got := []byte{}
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(string(got), "\r\n\r\n") {
		if time.Now().After(deadline) {
			t.Fatalf("timed out reading response; got: %q", got)
		}
		n, readErr := conn.Read(buf)
		if n > 0 {
			got = append(got, buf[:n]...)
		}
		if readErr != nil {
			break
		}
	}
	headers, _, _ := strings.Cut(string(got), "\r\n\r\n")
	return headers
}

// wrapWithTestIdentity injects a synthetic auth.Identity into the request
// context, simulating what requireAuth does in production.
func wrapWithTestIdentity(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := auth.WithIdentity(r.Context(), &auth.Identity{
			TokenID:   "test-token-id",
			User:      "root",
			Realm:     "pbs",
			TokenName: "test1",
		})
		h.ServeHTTP(w, r.WithContext(ctx))
	})
}

// newTestHandler constructs a Handler with all real sub-handlers and stub fallback.
func newTestHandler(db *sql.DB) *Handler {
	return NewHandler(
		datastore.NewLookup(db),
		session.NewStore(db),
		db,
		blob.NewHandler(),
		finish.NewHandler(session.NewStore(db), db),
		fixedindex.NewHandler(),
		fixedchunk.NewHandler(),
		fixedappend.NewHandler(),
		fixedclose.NewHandler(),
		dynamicindex.NewHandler(),
		dynamicchunk.NewHandler(),
		dynamicappend.NewHandler(),
		dynamicclose.NewHandler(),
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}),
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}),
		StubStreamHandler(),
	)
}

func TestHandler_WrongDatastore_Returns403(t *testing.T) {
	db := setupTestDB(t)
	h := newTestHandler(db)

	// Token scoped to a different datastore — test-ds-1 is the real one.
	scoped := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := auth.WithIdentity(r.Context(), &auth.Identity{
			TokenID:          "test-token-id",
			User:             "root",
			Realm:            "pbs",
			TokenName:        "test1",
			TokenDatastoreID: "different-ds-id",
		})
		h.ServeHTTP(w, r.WithContext(ctx))
	})

	srv := httptest.NewServer(scoped)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=1735000000", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", UpgradeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestUpgrade_NewGroup_WritesOwnerFile(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDBAtPath(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	headers := do101(t, host, host, "/api2/json/backup?store=default&backup-type=vm&backup-id=999&backup-time=1735000000")

	if !strings.HasPrefix(headers, "HTTP/1.1 101") {
		t.Fatalf("expected 101, got:\n%s", headers)
	}

	ownerPath := filepath.Join(tmp, "vm", "999", "owner")
	data, err := os.ReadFile(ownerPath)
	if err != nil {
		t.Fatalf("owner file not written: %v", err)
	}
	if got := strings.TrimRight(string(data), "\n"); got != "root@pbs!test1" {
		t.Errorf("owner file contents: got %q, want %q", got, "root@pbs!test1")
	}
}

func TestUpgrade_SameUserSameGroup_AllowedIdempotent(t *testing.T) {
	tmp := t.TempDir()

	// Pre-create owner file as root@pbs!test1 (same token that will back up).
	groupDir := filepath.Join(tmp, "vm", "999")
	if err := os.MkdirAll(groupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(groupDir, "owner"), []byte("root@pbs!test1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	db := setupTestDBAtPath(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	headers := do101(t, host, host, "/api2/json/backup?store=default&backup-type=vm&backup-id=999&backup-time=1735000000")

	if !strings.HasPrefix(headers, "HTTP/1.1 101") {
		t.Errorf("expected 101 for same-owner re-backup, got:\n%s", headers)
	}

	// Owner file must be unchanged.
	data, err := os.ReadFile(filepath.Join(groupDir, "owner"))
	if err != nil {
		t.Fatalf("owner file missing: %v", err)
	}
	if got := strings.TrimRight(string(data), "\n"); got != "root@pbs!test1" {
		t.Errorf("owner file changed: got %q, want %q", got, "root@pbs!test1")
	}
}

func TestUpgrade_DifferentTokenSameUser_Returns403(t *testing.T) {
	tmp := t.TempDir()

	// Pre-create owner as root@pbs!test1 (the standard test token).
	groupDir := filepath.Join(tmp, "vm", "999")
	if err := os.MkdirAll(groupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(groupDir, "owner"), []byte("root@pbs!test1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	db := setupTestDBAtPath(t, tmp)
	h := newTestHandler(db)

	// Inject a different token of the same user.
	otherToken := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := auth.WithIdentity(r.Context(), &auth.Identity{
			TokenID:   "other-token-id",
			User:      "root",
			Realm:     "pbs",
			TokenName: "other",
		})
		h.ServeHTTP(w, r.WithContext(ctx))
	})

	srv := httptest.NewServer(otherToken)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/backup?store=default&backup-type=vm&backup-id=999&backup-time=1735000000", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", UpgradeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for different token same user, got %d", resp.StatusCode)
	}
}

func TestUpgrade_DifferentUser_Returns403(t *testing.T) {
	tmp := t.TempDir()

	// Pre-create owner file as alice@pbs (different from root@pbs who will attempt backup).
	groupDir := filepath.Join(tmp, "vm", "999")
	if err := os.MkdirAll(groupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(groupDir, "owner"), []byte("alice@pbs\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	db := setupTestDBAtPath(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h)) // wrapWithTestIdentity uses root@pbs
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/backup?store=default&backup-type=vm&backup-id=999&backup-time=1735000000", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", UpgradeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for owner mismatch, got %d", resp.StatusCode)
	}

	// No session row should have been inserted.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pbs_active_sessions`).Scan(&count); err != nil {
		t.Fatalf("session count query: %v", err)
	}
	if count != 0 {
		t.Errorf("expected no session rows, got %d", count)
	}

	// Owner file must be unchanged.
	data, _ := os.ReadFile(filepath.Join(groupDir, "owner"))
	if got := strings.TrimRight(string(data), "\n"); got != "alice@pbs" {
		t.Errorf("owner file was modified: got %q", got)
	}
}

func TestHandler_NoUpgradeHeaders_Returns501(t *testing.T) {
	db := setupTestDB(t)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=1735000000")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", resp.StatusCode)
	}
}

func TestHandler_InvalidParams_Returns400(t *testing.T) {
	db := setupTestDB(t)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/backup?store=default", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", UpgradeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_DatastoreNotFound_Returns404(t *testing.T) {
	db := setupTestDB(t)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/backup?store=nonexistent&backup-type=vm&backup-id=1&backup-time=1735000000", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", UpgradeToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// TestHandler_FullUpgradeDance verifies the complete upgrade flow:
//  1. Send GET with Upgrade headers over TLS
//  2. Receive 101 Switching Protocols
//  3. Drive HTTP/2 over the same connection
//  4. Issue an H2 GET request
//  5. Receive 501 from the stub stream handler
//  6. Verify session row was created and finalized to 'aborted'
//
// This is the moment-of-truth integration test — the same dance that
// crashed Node in PR #244.
func TestHandler_FullUpgradeDance(t *testing.T) {
	db := setupTestDBAtPath(t, t.TempDir())
	h := newTestHandler(db)

	// Use a TLS test server. EnableHTTP2=false so the test server doesn't
	// negotiate H2 via ALPN — we want to drive the upgrade manually.
	srv := httptest.NewUnstartedServer(wrapWithTestIdentity(h))
	srv.EnableHTTP2 = false
	srv.StartTLS()
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "https://")

	certPool := x509.NewCertPool()
	certPool.AddCert(srv.Certificate())

	tlsConn, err := tls.Dial("tcp", host, &tls.Config{
		RootCAs:    certPool,
		NextProtos: []string{"http/1.1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer tlsConn.Close()
	_ = tlsConn.SetDeadline(time.Now().Add(10 * time.Second))

	// Step 1: send the upgrade request.
	upgradeReq := "GET /api2/json/backup?store=default&backup-type=vm&backup-id=100&backup-time=1735000000 HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + UpgradeToken + "\r\n" +
		"\r\n"
	if _, err := tlsConn.Write([]byte(upgradeReq)); err != nil {
		t.Fatalf("write upgrade req: %v", err)
	}

	// Step 2: read until we see the end of the HTTP/1.1 101 response headers.
	buf := make([]byte, 4096)
	got := []byte{}
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(string(got), "\r\n\r\n") {
		if time.Now().After(deadline) {
			t.Fatalf("timed out reading 101 response; got so far: %q", got)
		}
		n, err := tlsConn.Read(buf)
		if err != nil {
			t.Fatalf("read 101: %v (got %q)", err, got)
		}
		got = append(got, buf[:n]...)
	}

	headers, _, _ := strings.Cut(string(got), "\r\n\r\n")
	if !strings.HasPrefix(headers, "HTTP/1.1 101") {
		t.Fatalf("expected 101, got:\n%s", headers)
	}
	if !strings.Contains(headers, "Upgrade: "+UpgradeToken) {
		t.Errorf("missing Upgrade header in 101 response:\n%s", headers)
	}

	// Step 3: drive HTTP/2 over the now-upgraded connection.
	tr := &http2.Transport{
		TLSClientConfig: &tls.Config{
			RootCAs: certPool,
		},
	}
	cc, err := tr.NewClientConn(tlsConn)
	if err != nil {
		t.Fatalf("h2 NewClientConn: %v", err)
	}

	// Step 4: issue an H2 request and verify the stub stream handler responds.
	req, _ := http.NewRequest("GET", srv.URL+"/some/h2/path", nil)
	resp, err := cc.RoundTrip(req)
	if err != nil {
		t.Fatalf("h2 RoundTrip: %v", err)
	}
	defer resp.Body.Close()

	// Step 5: expect 501 from StubStreamHandler.
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("expected 501 from stub stream handler, got %d", resp.StatusCode)
	}

	// Close the connection so ServeConn returns and the finalize runs.
	tlsConn.Close()
	// Give the server goroutine a moment to finalize the session row.
	time.Sleep(100 * time.Millisecond)

	// Step 6: verify session row was created and finalized to 'aborted'.
	var rowCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM pbs_active_sessions`).Scan(&rowCount)
	if rowCount != 1 {
		t.Errorf("expected 1 session row, got %d", rowCount)
	}
	var state string
	_ = db.QueryRow(`SELECT state FROM pbs_active_sessions LIMIT 1`).Scan(&state)
	if state != "aborted" {
		t.Errorf("expected state='aborted' after connection close, got %q", state)
	}
}

// TestUpgrade_InsertsSyntheticJobAndRun verifies that a successful upgrade
// inserts backup_jobs and backup_runs rows before the H2 session starts.
func TestUpgrade_InsertsSyntheticJobAndRun(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDBAtPath(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(wrapWithTestIdentity(h))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	headers := do101(t, host, host, "/api2/json/backup?store=default&backup-type=vm&backup-id=100&backup-time=1735000000")

	if !strings.HasPrefix(headers, "HTTP/1.1 101") {
		t.Fatalf("expected 101, got:\n%s", headers)
	}

	// Job row must exist.
	var jobCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM backup_jobs`).Scan(&jobCount)
	if jobCount != 1 {
		t.Errorf("expected 1 backup_jobs row, got %d", jobCount)
	}

	// Run row must exist with status='running'.
	var runStatus string
	_ = db.QueryRow(`SELECT status FROM backup_runs LIMIT 1`).Scan(&runStatus)
	if runStatus != "running" {
		t.Errorf("expected run status='running', got %q", runStatus)
	}
}
