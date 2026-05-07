// Package nbdread reads byte ranges from an NBD server using libnbd's nbdsh tool.
// All TLS verification is handled by passing the server's self-signed cert as
// the trusted CA in a per-call temporary directory.
package nbdread

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Region describes a contiguous byte range to read from the export.
// Mirrors xapi.ChangedRegion but is duplicated here to keep this package
// dependency-free.
type Region struct {
	Offset int64 `json:"offset"`
	Length int64 `json:"length"`
}

// Connection holds the parameters needed to reach an NBD export.
type Connection struct {
	Address    string
	Port       int
	ExportName string
	// CertPEM is the server's TLS certificate in PEM form, returned from
	// VDI.get_nbd_info. This is used as the trust anchor — the server cert is
	// expected to match this exactly.
	CertPEM string
	// Subject is the cert's CN; used as the TLS hostname so cert verification
	// succeeds when connecting by IP address.
	Subject string
}

// ReadResult summarises a successful read.
type ReadResult struct {
	BytesRead   int64
	RegionCount int
	SHA256Hex   string
	DurationMS  int64
}

// ReadRegions connects to the NBD server described by conn and reads each
// region into out. Reads are sequential on a single TLS connection.
//
// Returns ReadResult on success. The SHA256 is computed over the concatenation
// of all region bytes in the order given (matches what the eventual restic
// stream will see).
//
// Requires `nbdsh` to be available on PATH. Returns a clear error if it isn't.
func ReadRegions(ctx context.Context, conn Connection, regions []Region, out io.Writer) (*ReadResult, error) {
	if _, err := exec.LookPath("nbdsh"); err != nil {
		return nil, fmt.Errorf("nbdread: nbdsh not found on PATH (install libnbd-bin and python3-libnbd): %w", err)
	}
	if len(regions) == 0 {
		return &ReadResult{}, nil
	}
	if conn.Address == "" || conn.Port == 0 || conn.ExportName == "" {
		return nil, errors.New("nbdread: connection address, port, and export_name required")
	}
	if conn.CertPEM == "" {
		return nil, errors.New("nbdread: certPEM required (TLS-only)")
	}

	// Stage the cert so libnbd can find it. The directory must be 0700 and
	// contain ca-cert.pem.
	certDir, err := os.MkdirTemp("", "backupos-nbd-cert-*")
	if err != nil {
		return nil, fmt.Errorf("nbdread: tmpdir: %w", err)
	}
	defer os.RemoveAll(certDir)
	if err := os.Chmod(certDir, 0o700); err != nil {
		return nil, fmt.Errorf("nbdread: chmod cert dir: %w", err)
	}
	certPath := filepath.Join(certDir, "ca-cert.pem")
	if err := os.WriteFile(certPath, []byte(conn.CertPEM), 0o600); err != nil {
		return nil, fmt.Errorf("nbdread: write cert: %w", err)
	}

	uri := buildURI(conn, certDir)

	// Build a Python script that opens the connection and performs each pread,
	// writing raw bytes to stdout. Using a file avoids passing hundreds of
	// --command flags for large region lists.
	script := buildPythonScript(uri, regions)

	scriptPath := filepath.Join(certDir, "read.py")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		return nil, fmt.Errorf("nbdread: write script: %w", err)
	}

	cmd := exec.CommandContext(ctx, "nbdsh", "-f", scriptPath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("nbdread: stdout pipe: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	start := time.Now()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("nbdread: start nbdsh: %w", err)
	}

	hash := sha256.New()
	tee := io.MultiWriter(out, hash)
	bytesRead, err := io.Copy(tee, stdout)
	if err != nil {
		_ = cmd.Wait()
		return nil, fmt.Errorf("nbdread: copy: %w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("nbdread: nbdsh exited with error: %w (stderr=%s)", err, strings.TrimSpace(stderr.String()))
	}

	// Sanity check: bytes read must equal sum of region lengths.
	var expected int64
	for _, r := range regions {
		expected += r.Length
	}
	if bytesRead != expected {
		return nil, fmt.Errorf("nbdread: byte count mismatch: read %d, expected %d (stderr=%s)",
			bytesRead, expected, strings.TrimSpace(stderr.String()))
	}

	return &ReadResult{
		BytesRead:   bytesRead,
		RegionCount: len(regions),
		SHA256Hex:   hex.EncodeToString(hash.Sum(nil)),
		DurationMS:  time.Since(start).Milliseconds(),
	}, nil
}

// buildURI constructs the nbds:// URI for libnbd, embedding the path to the
// trust anchor directory and the TLS hostname (cert subject).
func buildURI(c Connection, certDir string) string {
	q := url.Values{}
	q.Set("tls-certificates", certDir)
	if c.Subject != "" {
		q.Set("tls-hostname", c.Subject)
	}
	// ExportName goes in the path, URL-encoded. XenServer's export names
	// include slashes and query-like syntax (e.g. "/<vdi-uuid>?session_id=...").
	// Per the NBD URI spec, paths after the host can be percent-encoded.
	return fmt.Sprintf("nbds://%s:%d/%s?%s",
		c.Address, c.Port, url.PathEscape(c.ExportName), q.Encode())
}

// buildPythonScript writes raw bytes for each region to stdout in order.
// nbdsh pre-imports the nbd module and exposes it as `nbd`.
func buildPythonScript(uri string, regions []Region) string {
	var b strings.Builder
	b.WriteString("import sys\n")
	b.WriteString("h = nbd.NBD()\n")
	fmt.Fprintf(&b, "h.connect_uri(%q)\n", uri)
	for _, r := range regions {
		fmt.Fprintf(&b, "sys.stdout.buffer.write(h.pread(%d, %d))\n", r.Length, r.Offset)
	}
	b.WriteString("sys.stdout.flush()\n")
	b.WriteString("h.shutdown()\n")
	return b.String()
}
