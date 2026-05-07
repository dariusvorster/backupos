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

// StreamResult summarises a successful full-disk stream operation.
type StreamResult struct {
	BytesWritten int64
	DurationMS   int64
}

// StreamFullExport connects to the NBD server described by conn and copies
// the entire export to out via nbdcopy. The --allocated flag skips unallocated
// extents on the source; since stdout can't be sparse, holes become explicit
// zero bytes which restic CDC will dedup to a single chunk.
//
// Requires nbdcopy on PATH (from libnbd-bin).
func StreamFullExport(ctx context.Context, conn Connection, out io.Writer) (*StreamResult, error) {
	if _, err := exec.LookPath("nbdcopy"); err != nil {
		return nil, fmt.Errorf("nbdread: nbdcopy not found on PATH (install libnbd-bin): %w", err)
	}
	if conn.Address == "" || conn.Port == 0 || conn.ExportName == "" {
		return nil, errors.New("nbdread: connection address, port, and export_name required")
	}
	if conn.CertPEM == "" {
		return nil, errors.New("nbdread: certPEM required (TLS-only)")
	}

	// Stage the cert. Same pattern as ReadRegions.
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

	// nbdcopy <URI> -  reads the entire export and writes raw bytes to stdout.
	// nbdcopy sets nbd_set_uri_allow_local_file unconditionally in its C code,
	// so no Python-style opt-in is needed here.
	cmd := exec.CommandContext(ctx, "nbdcopy", "--allocated", uri, "-")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("nbdread: stdout pipe: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	start := time.Now()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("nbdread: start nbdcopy: %w", err)
	}

	bytesWritten, err := io.Copy(out, stdout)
	if err != nil {
		_ = cmd.Wait()
		return nil, fmt.Errorf("nbdread: copy: %w (stderr=%s)",
			err, strings.TrimSpace(stderr.String()))
	}

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("nbdread: nbdcopy exited with error: %w (stderr=%s)",
			err, strings.TrimSpace(stderr.String()))
	}

	return &StreamResult{
		BytesWritten: bytesWritten,
		DurationMS:   time.Since(start).Milliseconds(),
	}, nil
}
