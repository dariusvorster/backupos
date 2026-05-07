package xapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
)

// PerRequestCredentials is an alias for PoolCredentials used by per-request
// XAPI sessions. The alias makes per-request usage grep-able.
type PerRequestCredentials = PoolCredentials

// WithSession opens a short-lived XAPI session, runs fn with the Client, and
// closes the session on return. Use for any handler that receives pool
// credentials per request rather than at startup.
func WithSession(ctx context.Context, creds PerRequestCredentials, fn func(*Client) error) error {
	if creds.PoolMasterURL == "" || creds.Username == "" || creds.Password == "" {
		return errors.New("xapi: pool URL, username, and password required")
	}
	c, err := New(Config{
		PoolMasterURL:      creds.PoolMasterURL,
		Username:           creds.Username,
		Password:           creds.Password,
		CertFingerprint:    creds.CertFingerprintSHA256,
		InsecureSkipVerify: creds.CertFingerprintSHA256 == "",
	}, slog.Default())
	if err != nil {
		return fmt.Errorf("xapi: create client: %w", err)
	}
	if err := c.Connect(ctx); err != nil {
		return fmt.Errorf("xapi: connect: %w", err)
	}
	defer c.Close() //nolint:errcheck
	return fn(c)
}
