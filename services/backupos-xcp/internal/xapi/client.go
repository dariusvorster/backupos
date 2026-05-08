// Package xapi wraps github.com/terra-farm/go-xen-api-client with session
// management, cert pinning, and reconnection. All XAPI calls in backupos-xcp
// go through Client; the raw generated client (xenapi.Client) is not used
// directly elsewhere.
package xapi

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// Config carries everything needed to open an XAPI session.
type Config struct {
	// PoolMasterURL is the base URL of the pool master (e.g. "https://192.168.69.2").
	// Trailing slash optional. The XAPI XML-RPC endpoint is "<URL>/" by convention.
	PoolMasterURL string

	// Username and Password authenticate via Session.LoginWithPassword.
	// For root@pam, Username = "root".
	Username string
	Password string

	// CertFingerprint, if non-empty, pins the host TLS cert by SHA256.
	// Format: "AB:CD:EF:..." (uppercase, colon-separated, matches openssl output).
	// If empty, the cert is verified against the system trust store.
	// Mutually exclusive with InsecureSkipVerify.
	CertFingerprint string

	// InsecureSkipVerify disables TLS verification entirely. Only for development
	// against self-signed homelab certs without a known fingerprint. Mutually
	// exclusive with CertFingerprint.
	InsecureSkipVerify bool

	// Timeout caps how long an XAPI call waits for response headers from the
	// host. Defaults to 30s if zero. Note: this is ResponseHeaderTimeout, not
	// total request timeout — long-running calls (e.g. CBT bitmap streaming)
	// can still take longer than this once data starts flowing.
	Timeout time.Duration
}

// Client is a managed XAPI session.
type Client struct {
	cfg    Config
	logger *slog.Logger

	mu      sync.Mutex
	raw     *xenapi.Client    // generated client (xen-api-client)
	session xenapi.SessionRef // current valid session ref, or empty
}

// New constructs a Client with the given config and logger. It does not
// open a session — call Connect before making any XAPI call.
func New(cfg Config, logger *slog.Logger) (*Client, error) {
	if cfg.PoolMasterURL == "" {
		return nil, errors.New("xapi: PoolMasterURL required")
	}
	if cfg.Username == "" {
		return nil, errors.New("xapi: Username required")
	}
	if cfg.Password == "" {
		return nil, errors.New("xapi: Password required")
	}
	if cfg.CertFingerprint != "" && cfg.InsecureSkipVerify {
		return nil, errors.New("xapi: CertFingerprint and InsecureSkipVerify are mutually exclusive")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Client{cfg: cfg, logger: logger}, nil
}

// Connect opens an XAPI session. Safe to call multiple times — if a valid
// session already exists, Connect is a no-op.
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.raw != nil && c.session != "" {
		return nil // already connected
	}

	transport, err := c.buildTransport()
	if err != nil {
		return fmt.Errorf("xapi: build http transport: %w", err)
	}

	rawURL, err := c.xmlrpcURL()
	if err != nil {
		return fmt.Errorf("xapi: parse pool master url: %w", err)
	}

	raw, err := xenapi.NewClient(rawURL, transport)
	if err != nil {
		return fmt.Errorf("xapi: new generated client: %w", err)
	}

	session, err := raw.Session.LoginWithPassword(c.cfg.Username, c.cfg.Password, "1.0", "backupos-xcp")
	if err != nil {
		return fmt.Errorf("xapi: login: %w", err)
	}

	c.raw = raw
	c.session = session
	c.logger.Info("xapi session opened",
		"pool_master_url", c.cfg.PoolMasterURL,
		"user", c.cfg.Username,
	)
	return nil
}

// Close logs out the current session, if any. Idempotent.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.raw == nil || c.session == "" {
		return nil
	}
	err := c.raw.Session.Logout(c.session)
	c.raw = nil
	c.session = ""
	if err != nil {
		c.logger.Warn("xapi session logout error", "error", err)
		return fmt.Errorf("xapi: logout: %w", err)
	}
	c.logger.Info("xapi session closed")
	return nil
}

// Session returns the underlying generated client and current session ref,
// reconnecting if necessary. Callers MUST hold the returned mutex (released
// by calling the returned function) for the duration of any XAPI call to
// prevent the session from being swapped out mid-call.
//
// Typical usage:
//
//	raw, sess, release, err := client.Session(ctx)
//	if err != nil { return err }
//	defer release()
//	pool, err := raw.Pool.GetAllRecords(sess)
func (c *Client) Session(ctx context.Context) (*xenapi.Client, xenapi.SessionRef, func(), error) {
	if err := c.Connect(ctx); err != nil {
		return nil, "", nil, err
	}
	c.mu.Lock()
	return c.raw, c.session, c.mu.Unlock, nil
}

// GetSessionID returns the active session ID as a plain string, suitable for
// use in URL query parameters (e.g. /import_raw_vdi?session_id=...).
func (c *Client) GetSessionID(ctx context.Context) (string, error) {
	_, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", err
	}
	id := string(sess)
	release()
	return id, nil
}

// PoolName returns the human-readable name of the connected pool.
// Convenience wrapper for the /api2/json/pool endpoint.
func (c *Client) PoolName(ctx context.Context) (uuid string, name string, err error) {
	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", "", err
	}
	defer release()

	poolRefs, err := raw.Pool.GetAll(sess)
	if err != nil {
		return "", "", fmt.Errorf("xapi: pool.get_all: %w", err)
	}
	if len(poolRefs) == 0 {
		return "", "", errors.New("xapi: no pool found")
	}
	poolRef := poolRefs[0]

	// Use primitive getters instead of GetRecord. The library's PoolRecord
	// struct includes allowed_operations as a strict enum, but XCP-ng 8.3
	// returns enum values (e.g. "cluster_create") that the 2021-era library
	// doesn't know. GetUUID and GetNameLabel return scalar strings and
	// bypass the problematic enum entirely.
	uuid, err = raw.Pool.GetUUID(sess, poolRef)
	if err != nil {
		return "", "", fmt.Errorf("xapi: pool.get_uuid: %w", err)
	}
	name, err = raw.Pool.GetNameLabel(sess, poolRef)
	if err != nil {
		return "", "", fmt.Errorf("xapi: pool.get_name_label: %w", err)
	}
	return uuid, name, nil
}

// xmlrpcURL constructs the XML-RPC endpoint URL from PoolMasterURL.
func (c *Client) xmlrpcURL() (string, error) {
	raw := c.cfg.PoolMasterURL
	// url.Parse treats a bare host (no scheme) as a path, leaving Host empty.
	// Prepend the scheme so the host is parsed correctly before we normalise.
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" {
		u.Scheme = "https"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/"
	}
	return u.String(), nil
}

// buildTransport constructs an *http.Transport with the configured TLS settings
// (cert pinning OR insecure-skip OR system trust store). The library wraps this
// transport in its own *http.Client internally.
func (c *Client) buildTransport() (*http.Transport, error) {
	tlsCfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}

	switch {
	case c.cfg.InsecureSkipVerify:
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	case c.cfg.CertFingerprint != "":
		expected, err := normalizeFingerprint(c.cfg.CertFingerprint)
		if err != nil {
			return nil, err
		}
		tlsCfg.InsecureSkipVerify = true // we verify manually below
		tlsCfg.VerifyPeerCertificate = func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
			for _, raw := range rawCerts {
				cert, parseErr := x509.ParseCertificate(raw)
				if parseErr != nil {
					continue
				}
				got := sha256.Sum256(cert.Raw)
				if hex.EncodeToString(got[:]) == expected {
					return nil
				}
			}
			return fmt.Errorf("xapi: cert fingerprint mismatch (expected %s)", c.cfg.CertFingerprint)
		}
	}

	return &http.Transport{
		TLSClientConfig:       tlsCfg,
		ResponseHeaderTimeout: c.cfg.Timeout,
	}, nil
}

// normalizeFingerprint converts "AB:CD:EF:..." to "abcdef..." (lowercase hex).
func normalizeFingerprint(fp string) (string, error) {
	cleaned := strings.ReplaceAll(fp, ":", "")
	cleaned = strings.ToLower(cleaned)
	if len(cleaned) != 64 {
		return "", fmt.Errorf("xapi: fingerprint must be 64 hex chars (got %d)", len(cleaned))
	}
	if _, err := hex.DecodeString(cleaned); err != nil {
		return "", fmt.Errorf("xapi: fingerprint not valid hex: %w", err)
	}
	return cleaned, nil
}
