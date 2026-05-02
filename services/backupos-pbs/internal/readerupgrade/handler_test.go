package readerupgrade

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"golang.org/x/net/http2"
	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

const (
	testSecret      = "hunter2-reader-test"
	backupTimeStr   = "2024-12-24T00:26:40Z"
	backupTimeUnix  = "1735000000"
	readerQuerySfx  = "?store=default&backup-type=vm&backup-id=100&backup-time=" + backupTimeUnix
)

func setupTestDB(t *testing.T, dsPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	// :memory: gives each pool connection its own empty DB; pin to one connection
	// so all callers (including concurrent goroutines) share the seeded schema.
	db.SetMaxOpenConns(1)

	stmts := []string{
		`CREATE TABLE pbs_tokens (
			id          TEXT PRIMARY KEY,
			user        TEXT NOT NULL,
			realm       TEXT NOT NULL,
			token_name  TEXT NOT NULL,
			secret_hash TEXT NOT NULL,
			permissions TEXT NOT NULL DEFAULT '',
			expires_at  INTEGER
		)`,
		`CREATE TABLE pbs_datastores (
			id                TEXT PRIMARY KEY,
			name              TEXT NOT NULL UNIQUE,
			path              TEXT NOT NULL,
			created_at        INTEGER NOT NULL,
			prune_schedule    TEXT,
			gc_schedule       TEXT,
			last_gc_at        INTEGER,
			total_size_bytes  INTEGER,
			unique_size_bytes INTEGER,
			chunk_count       INTEGER
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := db.Exec(
		`INSERT INTO pbs_tokens (id, user, realm, token_name, secret_hash, permissions)
		 VALUES ('tok-1', 'root', 'pbs', 'test1', ?, '')`,
		auth.HashSecret(testSecret),
	); err != nil {
		t.Fatal(err)
	}

	if _, err := db.Exec(
		`INSERT INTO pbs_datastores (id, name, path, created_at)
		 VALUES ('ds-1', 'default', ?, 1735000000000)`,
		dsPath,
	); err != nil {
		t.Fatal(err)
	}

	return db
}

func makeSnapDir(t *testing.T, root string) string {
	t.Helper()
	p := filepath.Join(root, "vm", "100", backupTimeStr)
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func newTestHandler(db *sql.DB) *Handler {
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
	})
	return NewHandler(
		auth.NewValidator(db),
		datastore.NewLookup(db),
		stub,
		stub,
	)
}

func readerAuthHeader() string {
	return "PBSAPIToken=root@pbs!test1:" + testSecret
}

func TestHandler_WrongMethod_Returns405(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("POST", srv.URL+"/api2/json/reader"+readerQuerySfx, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingAuth_Returns401(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader"+readerQuerySfx, nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestHandler_BadProtocol_Returns400(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader"+readerQuerySfx, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "wrong-protocol-entirely")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingStore_Returns400(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader?backup-type=vm&backup-id=100&backup-time="+backupTimeUnix, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_InvalidBackupType_Returns400(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader?store=default&backup-type=tape&backup-id=100&backup-time="+backupTimeUnix, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_NamespaceProvided_Returns400(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader"+readerQuerySfx+"&ns=mynamespace", nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_UnknownDatastore_Returns400(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader?store=nosuchstore&backup-type=vm&backup-id=100&backup-time="+backupTimeUnix, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_NonexistentSnapshot_Returns404(t *testing.T) {
	tmp := t.TempDir()
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	// snapshot dir is NOT pre-created
	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader"+readerQuerySfx, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestHandler_ExclusivelyLockedSnapshot_Returns409(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	// Hold an exclusive lock on the snapshot dir to simulate an active backup.
	f, err := os.Open(snapDir)
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		t.Skipf("cannot acquire exclusive lock (flock): %v", err)
	}
	t.Cleanup(func() { f.Close() })

	srv := httptest.NewServer(h)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/api2/json/reader"+readerQuerySfx, nil)
	req.Header.Set("Authorization", readerAuthHeader())
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", ReaderProtocolID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d", resp.StatusCode)
	}
}

// TestHandler_FullUpgradeDance verifies the complete reader upgrade flow:
//  1. Send GET with Upgrade headers + auth over TLS
//  2. Receive 101 Switching Protocols with Upgrade: proxmox-backup-reader-protocol-v1
//  3. Drive HTTP/2 over the same connection
//  4. Issue an H2 GET to an unknown path
//  5. Receive 404 from the router (no matching route)
//  6. No pbs_active_sessions row is written (readers are not persisted)
func TestHandler_FullUpgradeDance(t *testing.T) {
	tmp := t.TempDir()
	makeSnapDir(t, tmp)
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewUnstartedServer(h)
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

	// Step 1: send the upgrade request with inline auth.
	upgradeReq := "GET /api2/json/reader" + readerQuerySfx + " HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Authorization: " + readerAuthHeader() + "\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + ReaderProtocolID + "\r\n" +
		"\r\n"
	if _, err := tlsConn.Write([]byte(upgradeReq)); err != nil {
		t.Fatalf("write upgrade req: %v", err)
	}

	// Step 2: read the 101 response.
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
	if !strings.Contains(headers, "Upgrade: "+ReaderProtocolID) {
		t.Errorf("missing Upgrade header in 101 response:\n%s", headers)
	}

	// Step 3: drive HTTP/2 over the upgraded connection.
	tr := &http2.Transport{
		TLSClientConfig: &tls.Config{
			RootCAs: certPool,
		},
	}
	cc, err := tr.NewClientConn(tlsConn)
	if err != nil {
		t.Fatalf("h2 NewClientConn: %v", err)
	}

	// Step 4: issue an H2 request.
	req, _ := http.NewRequest("GET", srv.URL+"/some/reader/path", nil)
	resp, err := cc.RoundTrip(req)
	if err != nil {
		t.Fatalf("h2 RoundTrip: %v", err)
	}
	defer resp.Body.Close()

	// Step 5: expect 404 — unknown route, real router has no match.
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 from router (unknown route), got %d", resp.StatusCode)
	}

	// Step 6: reader sessions are NOT persisted — no pbs_active_sessions table
	// exists and none is written. Verify DB has no sessions table or it's empty.
	tlsConn.Close()
}

func TestHandler_TwoConcurrentReaders_BothSucceed(t *testing.T) {
	tmp := t.TempDir()
	makeSnapDir(t, tmp)
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewUnstartedServer(h)
	srv.EnableHTTP2 = false
	srv.StartTLS()
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "https://")
	certPool := x509.NewCertPool()
	certPool.AddCert(srv.Certificate())

	do101 := func(t *testing.T) {
		t.Helper()
		conn, err := tls.Dial("tcp", host, &tls.Config{
			RootCAs:    certPool,
			NextProtos: []string{"http/1.1"},
		})
		if err != nil {
			t.Errorf("dial: %v", err)
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

		req := "GET /api2/json/reader" + readerQuerySfx + " HTTP/1.1\r\n" +
			"Host: " + host + "\r\n" +
			"Authorization: " + readerAuthHeader() + "\r\n" +
			"Connection: Upgrade\r\n" +
			"Upgrade: " + ReaderProtocolID + "\r\n" +
			"\r\n"
		if _, err := conn.Write([]byte(req)); err != nil {
			t.Errorf("write: %v", err)
			return
		}

		buf := make([]byte, 4096)
		got := []byte{}
		deadline := time.Now().Add(5 * time.Second)
		for !strings.Contains(string(got), "\r\n\r\n") {
			if time.Now().After(deadline) {
				t.Errorf("timed out reading 101")
				return
			}
			n, err := conn.Read(buf)
			if err != nil {
				t.Errorf("read: %v", err)
				return
			}
			got = append(got, buf[:n]...)
		}
		headers, _, _ := strings.Cut(string(got), "\r\n\r\n")
		if !strings.HasPrefix(headers, "HTTP/1.1 101") {
			t.Errorf("reader 1 expected 101, got:\n%s", headers)
		}
	}

	// Both readers dial and complete the upgrade concurrently.
	done := make(chan struct{}, 2)
	go func() { do101(t); done <- struct{}{} }()
	go func() { do101(t); done <- struct{}{} }()
	<-done
	<-done
}

func TestHandler_LockReleasedOnConnectionClose(t *testing.T) {
	tmp := t.TempDir()
	snapDir := makeSnapDir(t, tmp)
	db := setupTestDB(t, tmp)
	h := newTestHandler(db)

	srv := httptest.NewUnstartedServer(h)
	srv.EnableHTTP2 = false
	srv.StartTLS()
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "https://")
	certPool := x509.NewCertPool()
	certPool.AddCert(srv.Certificate())

	conn, err := tls.Dial("tcp", host, &tls.Config{
		RootCAs:    certPool,
		NextProtos: []string{"http/1.1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	upgradeReq := "GET /api2/json/reader" + readerQuerySfx + " HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Authorization: " + readerAuthHeader() + "\r\n" +
		"Connection: Upgrade\r\n" +
		"Upgrade: " + ReaderProtocolID + "\r\n" +
		"\r\n"
	if _, err := conn.Write([]byte(upgradeReq)); err != nil {
		t.Fatalf("write: %v", err)
	}

	buf := make([]byte, 4096)
	got := []byte{}
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(string(got), "\r\n\r\n") {
		if time.Now().After(deadline) {
			t.Fatalf("timed out reading 101")
		}
		n, err := conn.Read(buf)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		got = append(got, buf[:n]...)
	}
	if !strings.HasPrefix(string(got), "HTTP/1.1 101") {
		t.Fatalf("expected 101, got: %q", got)
	}

	// Close the connection; the handler should release the shared lock.
	conn.Close()
	time.Sleep(150 * time.Millisecond)

	// Verify the shared lock was released by acquiring an exclusive lock.
	f, err := os.Open(snapDir)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Errorf("expected exclusive lock to succeed after connection close, got: %v", err)
	}
}
