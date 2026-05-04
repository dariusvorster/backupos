// Package internalauth provides middleware for endpoints that should only be
// callable by the local backupos.service (web process) — never by external
// PBS clients.
//
// Requires header: Authorization: Bearer <BACKUPOS_INTERNAL_SECRET>
//
// The secret is read once at handler construction; rotating it requires a
// service restart (which is fine — it's set in /etc/backupos/server.env).
package internalauth

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
)

// syntheticIdentity is injected into context for requests that pass internal
// auth. Empty TokenDatastoreID means unrestricted — AuthorizeDatastore passes
// for any datastore.
var syntheticIdentity = &auth.Identity{
	TokenID:          "internal",
	User:             "backupos",
	Realm:            "internal",
	TokenName:        "internal",
	Permissions:      "admin",
	TokenDatastoreID: "",
}

// Middleware wraps next, rejecting requests without a valid bearer token.
// If secret is empty, EVERY request is rejected (fail-closed).
// On success, a synthetic admin Identity is injected into the context so
// downstream handlers that call auth.AuthorizeDatastore pass unconditionally.
func Middleware(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if secret == "" {
			http.Error(w, "internal auth not configured", http.StatusServiceUnavailable)
			return
		}
		gotAuth := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if !strings.HasPrefix(gotAuth, prefix) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		got := gotAuth[len(prefix):]
		if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := auth.WithIdentity(r.Context(), syntheticIdentity)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
