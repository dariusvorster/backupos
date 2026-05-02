package auth

import (
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"
)

// setupTestDB creates an in-memory SQLite DB with the pbs_tokens schema
// and one seeded row for testing.
//
// We intentionally minimize the schema here — only the columns Validator
// reads. The full Drizzle-generated schema is not needed for an isolated
// auth test.
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_tokens (
			id            TEXT PRIMARY KEY,
			user          TEXT NOT NULL,
			realm         TEXT NOT NULL,
			token_name    TEXT NOT NULL,
			secret_hash   TEXT NOT NULL,
			permissions   TEXT NOT NULL,
			expires_at    INTEGER,
			datastore_id  TEXT,
			last_used_at  INTEGER
		);
	`)
	if err != nil {
		t.Fatal(err)
	}

	// Seed a known token: root@pbs!test1 with secret "topsecret"
	// secret_hash = sha256("topsecret")
	knownHash := HashSecret("topsecret")
	_, err = db.Exec(`
		INSERT INTO pbs_tokens (id, user, realm, token_name, secret_hash, permissions, expires_at)
		VALUES ('test-id-1', 'root', 'pbs', 'test1', ?, 'read', NULL)
	`, knownHash)
	if err != nil {
		t.Fatal(err)
	}

	return db
}

func TestValidator_Success(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{
		User:      "root",
		Realm:     "pbs",
		TokenName: "test1",
		Secret:    "topsecret",
	}
	id, err := v.Validate(parsed)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if id.TokenID != "test-id-1" {
		t.Errorf("tokenID: got %q", id.TokenID)
	}
	if id.User != "root" {
		t.Errorf("user: got %q", id.User)
	}
	if id.Permissions != "read" {
		t.Errorf("permissions: got %q", id.Permissions)
	}
}

func TestValidator_TokenNotFound(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{
		User:      "doesnotexist",
		Realm:     "pbs",
		TokenName: "test1",
		Secret:    "topsecret",
	}
	_, err := v.Validate(parsed)
	if !errors.Is(err, ErrTokenNotFound) {
		t.Errorf("expected ErrTokenNotFound, got %v", err)
	}
}

func TestValidator_SecretMismatch(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{
		User:      "root",
		Realm:     "pbs",
		TokenName: "test1",
		Secret:    "wrong-secret",
	}
	_, err := v.Validate(parsed)
	if !errors.Is(err, ErrSecretMismatch) {
		t.Errorf("expected ErrSecretMismatch, got %v", err)
	}
}

func TestValidator_DatastoreID_Null_IsUnrestricted(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{User: "root", Realm: "pbs", TokenName: "test1", Secret: "topsecret"}
	id, err := v.Validate(parsed)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if id.TokenDatastoreID != "" {
		t.Errorf("expected empty TokenDatastoreID for NULL db row, got %q", id.TokenDatastoreID)
	}
}

func TestValidator_DatastoreID_NonNull_IsSet(t *testing.T) {
	db := setupTestDB(t)
	_, err := db.Exec(`UPDATE pbs_tokens SET datastore_id = 'ds-abc' WHERE id = 'test-id-1'`)
	if err != nil {
		t.Fatal(err)
	}

	v := NewValidator(db)
	parsed := &ParsedHeader{User: "root", Realm: "pbs", TokenName: "test1", Secret: "topsecret"}
	id, err := v.Validate(parsed)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if id.TokenDatastoreID != "ds-abc" {
		t.Errorf("expected TokenDatastoreID %q, got %q", "ds-abc", id.TokenDatastoreID)
	}
}

func TestValidator_LastUsedAt_SetOnSuccess(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{User: "root", Realm: "pbs", TokenName: "test1", Secret: "topsecret"}
	if _, err := v.Validate(parsed); err != nil {
		t.Fatalf("validate: %v", err)
	}

	var lastUsed *int64
	if err := db.QueryRow(`SELECT last_used_at FROM pbs_tokens WHERE id = 'test-id-1'`).Scan(&lastUsed); err != nil {
		t.Fatal(err)
	}
	if lastUsed == nil {
		t.Error("expected last_used_at to be set after successful Validate")
	}
}

func TestValidator_LastUsedAt_NotSetOnBadSecret(t *testing.T) {
	db := setupTestDB(t)
	v := NewValidator(db)

	parsed := &ParsedHeader{User: "root", Realm: "pbs", TokenName: "test1", Secret: "wrong"}
	_, _ = v.Validate(parsed)

	var lastUsed *int64
	if err := db.QueryRow(`SELECT last_used_at FROM pbs_tokens WHERE id = 'test-id-1'`).Scan(&lastUsed); err != nil {
		t.Fatal(err)
	}
	if lastUsed != nil {
		t.Error("expected last_used_at to remain NULL after failed Validate")
	}
}

func TestValidator_Expired(t *testing.T) {
	db := setupTestDB(t)
	// Set expires_at to epoch + 1 second (year 1970 — definitely in the past)
	_, err := db.Exec(`UPDATE pbs_tokens SET expires_at = ? WHERE id = 'test-id-1'`,
		1000) // 1 second past epoch in millis
	if err != nil {
		t.Fatal(err)
	}

	v := NewValidator(db)
	parsed := &ParsedHeader{
		User:      "root",
		Realm:     "pbs",
		TokenName: "test1",
		Secret:    "topsecret",
	}
	_, err = v.Validate(parsed)
	if !errors.Is(err, ErrTokenExpired) {
		t.Errorf("expected ErrTokenExpired, got %v", err)
	}
}
