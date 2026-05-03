// Package auth implements PBS token validation.
//
// Wire formats: "PBSAPIToken=user@realm!tokenname:secret" (proxmox-backup-client)
//               "PBSAPIToken user@realm!tokenname:secret" (pveproxy / RFC 7235)
//
// Hash format: sha256(secret) as lowercase hex. No salt. Matches the
// M3b Node implementation exactly so existing tokens validate.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Identity is the result of a successful auth.
type Identity struct {
	TokenID          string
	User             string
	Realm            string
	TokenName        string
	Permissions      string
	TokenDatastoreID string // empty = unrestricted; non-empty = token scoped to this datastore ID
}

// ParsedHeader is the result of parsing the Authorization header.
type ParsedHeader struct {
	User      string
	Realm     string
	TokenName string
	Secret    string
}

// ErrMalformed indicates the Authorization header could not be parsed.
var ErrMalformed = errors.New("malformed Authorization header")

// ErrTokenNotFound indicates no matching token row in pbs_tokens.
var ErrTokenNotFound = errors.New("token not found")

// ErrSecretMismatch indicates the provided secret didn't match the stored hash.
var ErrSecretMismatch = errors.New("invalid secret")

// ErrTokenExpired indicates the token's expires_at is in the past.
var ErrTokenExpired = errors.New("token expired")

// ParseAuthHeader extracts user, realm, tokenName, and secret from the
// Authorization header value. Returns ErrMalformed if the header doesn't
// match the expected format.
//
// Accepts both formats real PBS accepts:
//
//	"PBSAPIToken=user@realm!tokenname:secret"  (proxmox-backup-client)
//	"PBSAPIToken user@realm!tokenname:secret"  (RFC 7235, pveproxy)
func ParseAuthHeader(header string) (*ParsedHeader, error) {
	const scheme = "PBSAPIToken"
	if !strings.HasPrefix(header, scheme) {
		return nil, ErrMalformed
	}
	if len(header) <= len(scheme) {
		return nil, ErrMalformed
	}
	sep := header[len(scheme)]
	if sep != '=' && sep != ' ' {
		return nil, ErrMalformed
	}
	raw := header[len(scheme)+1:]

	colonIdx := strings.Index(raw, ":")
	if colonIdx == -1 {
		return nil, ErrMalformed
	}
	identPart := raw[:colonIdx]
	secret := raw[colonIdx+1:]
	if secret == "" {
		return nil, ErrMalformed
	}

	bangIdx := strings.Index(identPart, "!")
	if bangIdx == -1 {
		return nil, ErrMalformed
	}
	userRealm := identPart[:bangIdx]
	tokenName := identPart[bangIdx+1:]
	if tokenName == "" {
		return nil, ErrMalformed
	}

	atIdx := strings.Index(userRealm, "@")
	if atIdx == -1 {
		return nil, ErrMalformed
	}
	user := userRealm[:atIdx]
	realm := userRealm[atIdx+1:]
	if user == "" || realm == "" {
		return nil, ErrMalformed
	}

	return &ParsedHeader{
		User:      user,
		Realm:     realm,
		TokenName: tokenName,
		Secret:    secret,
	}, nil
}

// HashSecret returns the SHA-256 hex of the secret. Lowercase hex,
// 64 characters. Matches the M3b Node implementation.
func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// Validator looks up tokens in the database and validates secrets.
type Validator struct {
	db *sql.DB
}

// NewValidator constructs a Validator using the given DB connection.
func NewValidator(db *sql.DB) *Validator {
	return &Validator{db: db}
}

// Validate looks up the token by (user, realm, tokenName), compares
// the secret hash in constant time, and checks expiry.
//
// Returns Identity on success, or one of ErrTokenNotFound / ErrSecretMismatch
// / ErrTokenExpired on failure.
//
// Note: we deliberately don't distinguish ErrTokenNotFound from
// ErrSecretMismatch in the response status (both produce 401) — but the
// errors are distinct here for logging purposes.
func (v *Validator) Validate(parsed *ParsedHeader) (*Identity, error) {
	const query = `
		SELECT id, secret_hash, permissions, expires_at, datastore_id
		FROM pbs_tokens
		WHERE user = ? AND realm = ? AND token_name = ?
		LIMIT 1
	`
	var (
		tokenID         string
		storedHash      string
		permissions     string
		expiresAtMillis sql.NullInt64
		datastoreID     sql.NullString
	)
	err := v.db.QueryRow(query, parsed.User, parsed.Realm, parsed.TokenName).
		Scan(&tokenID, &storedHash, &permissions, &expiresAtMillis, &datastoreID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("token lookup: %w", err)
	}

	// Constant-time hash comparison.
	computed := HashSecret(parsed.Secret)
	if subtle.ConstantTimeCompare([]byte(computed), []byte(storedHash)) != 1 {
		return nil, ErrSecretMismatch
	}

	// Expiry check (if expires_at is set).
	if expiresAtMillis.Valid {
		expiresAt := time.UnixMilli(expiresAtMillis.Int64)
		if time.Now().After(expiresAt) {
			return nil, ErrTokenExpired
		}
	}

	// Non-fatal: record the time this token was last used.
	if _, err := v.db.Exec(
		`UPDATE pbs_tokens SET last_used_at = ? WHERE id = ?`,
		time.Now().UnixMilli(), tokenID,
	); err != nil {
		slog.Warn("failed to update last_used_at", "token_id", tokenID, "error", err)
	}

	return &Identity{
		TokenID:          tokenID,
		User:             parsed.User,
		Realm:            parsed.Realm,
		TokenName:        parsed.TokenName,
		Permissions:      permissions,
		TokenDatastoreID: datastoreID.String,
	}, nil
}

// Authid returns the full PBS authid string: "user@realm!tokenname".
// Since ParseAuthHeader always requires a non-empty tokenName, this is
// always a token authid (never bare user@realm).
func (id *Identity) Authid() string {
	return id.User + "@" + id.Realm + "!" + id.TokenName
}

// identityCtxKey is the context key type for stashing an Identity. Unexported
// so external packages can only access it via WithIdentity / FromContext.
type identityCtxKey struct{}

// WithIdentity returns a child context that carries the given Identity.
// The upgrade handler reads this via FromContext to record the token_id
// on session rows.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, identityCtxKey{}, id)
}

// FromContext returns the Identity attached by WithIdentity, or nil if none.
func FromContext(ctx context.Context) *Identity {
	id, _ := ctx.Value(identityCtxKey{}).(*Identity)
	return id
}
