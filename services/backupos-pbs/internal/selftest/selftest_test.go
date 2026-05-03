package selftest

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

func setupDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_tokens (
			id           TEXT PRIMARY KEY,
			user         TEXT NOT NULL,
			realm        TEXT NOT NULL,
			token_name   TEXT NOT NULL,
			secret_hash  TEXT NOT NULL,
			permissions  TEXT NOT NULL,
			expires_at   INTEGER,
			datastore_id TEXT,
			last_used_at INTEGER
		);
		CREATE TABLE pbs_datastores (
			id                    TEXT PRIMARY KEY,
			name                  TEXT NOT NULL UNIQUE,
			path                  TEXT NOT NULL,
			created_at            INTEGER NOT NULL,
			gc_schedule_interval  TEXT
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	hash := auth.HashSecret("topsecret")
	_, err = db.Exec(
		`INSERT INTO pbs_tokens (id, user, realm, token_name, secret_hash, permissions) VALUES (?, ?, ?, ?, ?, ?)`,
		"tok-1", "root", "pbs", "test1", hash, "read",
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.Exec(
		`INSERT INTO pbs_datastores (id, name, path, created_at) VALUES (?, ?, ?, ?)`,
		"ds-1", "default", "/var/lib/backupos/pbs/default", 0,
	)
	if err != nil {
		t.Fatal(err)
	}

	return db
}

func newHandler(t *testing.T) *Handler {
	t.Helper()
	db := setupDB(t)
	return NewHandler(db, datastore.NewLookup(db), "4.0.0")
}

func newReq(remoteAddr, selfTestHeader, authHeader, dsName string) *http.Request {
	r := httptest.NewRequest(http.MethodGet,
		"/api2/json/admin/self-test/datastore/"+dsName, nil)
	r.RemoteAddr = remoteAddr
	if selfTestHeader != "" {
		r.Header.Set("X-BackupOS-Self-Test", selfTestHeader)
	}
	if authHeader != "" {
		r.Header.Set("Authorization", authHeader)
	}
	return r
}

// hashAuth builds the Authorization header where the "secret" is the stored hash.
func hashAuth(secret string) string {
	hash := auth.HashSecret(secret)
	return "PBSAPIToken=root@pbs!test1:" + hash
}

// --- Case 1: accepted with hash + header + localhost ---------------------------

func TestSelfTest_AcceptedWithHashAndHeaderFromLocalhost(t *testing.T) {
	h := newHandler(t)
	w := httptest.NewRecorder()
	r := newReq("127.0.0.1:12345", "1", hashAuth("topsecret"), "default")

	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	data, _ := resp["data"].(map[string]any)
	if data["ok"] != true {
		t.Errorf("expected data.ok=true, got %v", data["ok"])
	}
	if data["datastoreReachable"] != true {
		t.Errorf("expected datastoreReachable=true, got %v", data["datastoreReachable"])
	}
}

// Verify IPv6 loopback also works.
func TestSelfTest_AcceptedFromIPv6Loopback(t *testing.T) {
	h := newHandler(t)
	w := httptest.NewRecorder()
	r := newReq("[::1]:12345", "1", hashAuth("topsecret"), "default")

	h.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

// --- Case 2: rejected without the self-test header ----------------------------

func TestSelfTest_RejectedWithoutHeader(t *testing.T) {
	h := newHandler(t)
	w := httptest.NewRecorder()
	r := newReq("127.0.0.1:12345", "" /* no header */, hashAuth("topsecret"), "default")

	h.ServeHTTP(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// --- Case 3: rejected from non-localhost --------------------------------------

func TestSelfTest_RejectedFromNonLocalhost(t *testing.T) {
	h := newHandler(t)
	w := httptest.NewRecorder()
	r := newReq("203.0.113.42:12345", "1", hashAuth("topsecret"), "default")

	h.ServeHTTP(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

// --- Case 4: normal plaintext secret is rejected (regression) -----------------
//
// The self-test endpoint expects the HASH as the credential, not the plaintext
// secret. Passing the plaintext secret must fail, proving the endpoint can't be
// used as a backdoor by someone who only knows the plaintext.
func TestSelfTest_PlaintextSecretRejected(t *testing.T) {
	h := newHandler(t)
	w := httptest.NewRecorder()
	// Use the plaintext secret directly (NOT the hash)
	plainAuth := "PBSAPIToken=root@pbs!test1:topsecret"
	r := newReq("127.0.0.1:12345", "1", plainAuth, "default")

	h.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when plaintext secret used instead of hash, got %d", w.Code)
	}
}
