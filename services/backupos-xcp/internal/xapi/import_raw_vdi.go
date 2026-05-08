package xapi

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ImportRawVDIOpts configures an /import_raw_vdi PUT request.
type ImportRawVDIOpts struct {
	PoolMasterURL         string
	SessionID             string // from GetSessionID — must remain valid for the upload duration
	VDIUUID               string
	CertFingerprintSHA256 string // "AB:CD:..." or empty to skip verification
}

// ImportRawVDIResult summarises a completed upload.
type ImportRawVDIResult struct {
	BytesWritten int64
	DurationMS   int64
	StatusCode   int
}

// ImportRawVDI uploads raw disk bytes to an XCP-ng VDI via the /import_raw_vdi
// HTTP PUT endpoint. The session must remain valid for the entire upload — call
// this inside a WithSession callback.
func ImportRawVDI(ctx context.Context, opts ImportRawVDIOpts, body io.Reader, contentLength int64) (*ImportRawVDIResult, error) {
	if opts.PoolMasterURL == "" {
		return nil, errors.New("xapi: PoolMasterURL required")
	}
	if opts.SessionID == "" {
		return nil, errors.New("xapi: SessionID required")
	}
	if opts.VDIUUID == "" {
		return nil, errors.New("xapi: VDIUUID required")
	}

	base := opts.PoolMasterURL
	for len(base) > 0 && base[len(base)-1] == '/' {
		base = base[:len(base)-1]
	}

	u, err := url.Parse(base + "/import_raw_vdi")
	if err != nil {
		return nil, fmt.Errorf("xapi: parse url: %w", err)
	}
	q := u.Query()
	q.Set("session_id", opts.SessionID)
	q.Set("vdi", opts.VDIUUID)
	q.Set("format", "raw")
	u.RawQuery = q.Encode()

	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if opts.CertFingerprintSHA256 != "" {
		expected, nerr := normalizeFingerprint(opts.CertFingerprintSHA256)
		if nerr != nil {
			return nil, nerr
		}
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
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
			return fmt.Errorf("xapi: cert fingerprint mismatch (expected %s)", opts.CertFingerprintSHA256)
		}
	} else {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	}

	httpClient := &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
		// No client-level timeout — the context deadline controls the upload.
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u.String(), body)
	if err != nil {
		return nil, fmt.Errorf("xapi: build request: %w", err)
	}
	req.ContentLength = contentLength
	req.Header.Set("Content-Type", "application/octet-stream")

	start := time.Now()
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xapi: import_raw_vdi PUT: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	durationMS := time.Since(start).Milliseconds()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xapi: import_raw_vdi returned HTTP %d", resp.StatusCode)
	}

	return &ImportRawVDIResult{
		BytesWritten: contentLength,
		DurationMS:   durationMS,
		StatusCode:   resp.StatusCode,
	}, nil
}
