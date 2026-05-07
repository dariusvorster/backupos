// Package internalauth gates internal-only HTTP routes by validating an
// Authorization: Bearer <BACKUPOS_INTERNAL_SECRET> header.
//
// Mirrors services/backupos-pbs/internal/internalauth — same pattern,
// without the PBS-specific auth.Identity injection.
package internalauth

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// Middleware wraps next, rejecting requests without a valid bearer token.
// If secret is empty, every request is rejected — fail-closed.
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
		next.ServeHTTP(w, r)
	})
}
