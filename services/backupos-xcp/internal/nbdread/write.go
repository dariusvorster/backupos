package nbdread

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// WriteResult summarises a successful NBD write operation.
type WriteResult struct {
	BytesRead  int64
	DurationMS int64
}

// UploadFromReader connects to the NBD server described by conn and writes all
// data from r to the export via nbdcopy. This is the inverse of StreamFullExport:
// it reads raw bytes from r and writes them to the NBD export.
//
// The session in conn.ExportName must remain open for the full duration of the
// write — call this inside a WithSession block (same constraint as StreamFullExport).
//
// Requires nbdcopy on PATH (from libnbd-bin).
func UploadFromReader(ctx context.Context, conn Connection, r io.Reader) (*WriteResult, error) {
	if _, err := exec.LookPath("nbdcopy"); err != nil {
		return nil, fmt.Errorf("nbdread: nbdcopy not found on PATH (install libnbd-bin): %w", err)
	}
	if conn.Address == "" || conn.Port == 0 || conn.ExportName == "" {
		return nil, errors.New("nbdread: connection address, port, and export_name required")
	}
	if conn.CertPEM == "" {
		return nil, errors.New("nbdread: certPEM required (TLS-only)")
	}

	certDir, err := os.MkdirTemp("", "backupos-nbd-cert-*")
	if err != nil {
		return nil, fmt.Errorf("nbdread: tmpdir: %w", err)
	}
	defer os.RemoveAll(certDir)
	if err := os.Chmod(certDir, 0o700); err != nil {
		return nil, fmt.Errorf("nbdread: chmod cert dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(certDir, "ca-cert.pem"), []byte(conn.CertPEM), 0o600); err != nil {
		return nil, fmt.Errorf("nbdread: write cert: %w", err)
	}

	uri := buildURI(conn, certDir)

	// nbdcopy - <URI> reads raw bytes from stdin and writes to the NBD export.
	counter := &countingReader{r: r}
	cmd := exec.CommandContext(ctx, "nbdcopy", "-", uri)
	cmd.Stdin = counter
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	start := time.Now()
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("nbdread: nbdcopy write exited with error: %w (stderr=%s)",
			err, strings.TrimSpace(stderr.String()))
	}

	return &WriteResult{
		BytesRead:  counter.n,
		DurationMS: time.Since(start).Milliseconds(),
	}, nil
}

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}
