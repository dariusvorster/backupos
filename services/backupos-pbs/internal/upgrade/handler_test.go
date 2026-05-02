package upgrade

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/net/http2"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
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
			prune_schedule TEXT, gc_schedule TEXT, last_gc_at INTEGER,
			total_size_bytes INTEGER, unique_size_bytes INTEGER, chunk_count INTEGER
		);
		INSERT INTO pbs_datastores (id, name, path, created_at)
		VALUES ('test-ds-1', 'default', '/tmp/test-ds', 1735000000000);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestHandler_NoUpgradeHeaders_Returns501(t *testing.T) {
	db := setupTestDB(t)
	h := NewHandler(datastore.NewLookup(db), StubStreamHandler())

	srv := httptest.NewServer(h)
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
	h := NewHandler(datastore.NewLookup(db), StubStreamHandler())

	srv := httptest.NewServer(h)
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
	h := NewHandler(datastore.NewLookup(db), StubStreamHandler())

	srv := httptest.NewServer(h)
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
//
// This is the moment-of-truth integration test — the same dance that
// crashed Node in PR #244.
func TestHandler_FullUpgradeDance(t *testing.T) {
	db := setupTestDB(t)
	h := NewHandler(datastore.NewLookup(db), StubStreamHandler())

	// Use a TLS test server. EnableHTTP2=false so the test server doesn't
	// negotiate H2 via ALPN — we want to drive the upgrade manually.
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
}
