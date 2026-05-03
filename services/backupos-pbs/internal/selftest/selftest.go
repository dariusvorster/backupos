// Package selftest implements the /api2/json/admin/self-test/datastore/<name>
// endpoint. This endpoint is used exclusively by the BackupOS web app to
// verify PBS connectivity without requiring the plaintext token secret.
//
// Security model:
//   - Only accepted from loopback addresses (127.0.0.1, ::1).
//   - Requires the X-BackupOS-Self-Test: 1 header so callers must be
//     intentional — accidental hash exposure in logs cannot be replayed.
//   - The Authorization header carries the stored hash as the "secret".
//     Since the hash already lives in the same database the web app reads,
//     any caller with DB access already has equivalent power.
//   - No effect on the normal token auth path; this handler is a separate
//     route, not a modification to the auth middleware.
package selftest

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
)

// Handler serves the self-test endpoint.
type Handler struct {
	db         *sql.DB
	datastores *datastore.Lookup
	version    string
}

// NewHandler constructs a Handler.
func NewHandler(db *sql.DB, datastores *datastore.Lookup, version string) *Handler {
	return &Handler{db: db, datastores: datastores, version: version}
}

// ServeHTTP handles GET /api2/json/admin/self-test/datastore/<name>.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !isLocalhost(r.RemoteAddr) {
		http.Error(w, "forbidden: self-test only available from localhost", http.StatusForbidden)
		return
	}
	if r.Header.Get("X-BackupOS-Self-Test") != "1" {
		http.Error(w, "missing X-BackupOS-Self-Test header", http.StatusBadRequest)
		return
	}

	const prefix = "/api2/json/admin/self-test/datastore/"
	name := strings.TrimPrefix(r.URL.Path, prefix)
	name = strings.TrimSuffix(name, "/")
	if name == "" {
		http.NotFound(w, r)
		return
	}

	parsed, err := auth.ParseAuthHeader(r.Header.Get("Authorization"))
	if err != nil {
		http.Error(w, "malformed Authorization header", http.StatusUnauthorized)
		return
	}

	storedHash, err := h.lookupHash(parsed.User, parsed.Realm, parsed.TokenName)
	if err != nil {
		http.Error(w, "token not found", http.StatusUnauthorized)
		return
	}

	// parsed.Secret IS the stored hash — compare directly in constant time.
	if subtle.ConstantTimeCompare([]byte(parsed.Secret), []byte(storedHash)) != 1 {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	_, dsErr := h.datastores.ByName(name)
	datastoreReachable := dsErr == nil

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]any{
			"ok":                 true,
			"version":            h.version,
			"datastoreReachable": datastoreReachable,
		},
	})
}

func (h *Handler) lookupHash(user, realm, tokenName string) (string, error) {
	var hash string
	err := h.db.QueryRow(
		`SELECT secret_hash FROM pbs_tokens WHERE user = ? AND realm = ? AND token_name = ? LIMIT 1`,
		user, realm, tokenName,
	).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("token not found")
	}
	return hash, err
}

// isLocalhost reports whether the TCP remote address is a loopback address.
func isLocalhost(remoteAddr string) bool {
	host := remoteAddr
	if idx := strings.LastIndex(remoteAddr, ":"); idx >= 0 {
		host = remoteAddr[:idx]
	}
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}
