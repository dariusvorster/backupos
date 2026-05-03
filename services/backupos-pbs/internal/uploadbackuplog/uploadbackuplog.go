// Package uploadbackuplog implements POST /api2/json/admin/datastore/<store>/upload-backup-log.
//
// PVE uploads the proxmox-backup-client log as client.log.blob after a backup
// completes. The file is written atomically (temp + rename). If it already
// exists, we return 409 to avoid overwriting it.
//
// The body is capped at 16 MiB to match PBS upstream behaviour.
package uploadbackuplog

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshotlocator"
)

const (
	logFileName = "client.log.blob"
	maxLogSize  = 16 * 1024 * 1024 // 16 MiB
)

// Handler serves POST /api2/json/admin/datastore/<store>/upload-backup-log.
type Handler struct {
	datastores *datastore.Lookup
}

// NewHandler constructs an upload-backup-log Handler.
func NewHandler(ds *datastore.Lookup) *Handler {
	return &Handler{datastores: ds}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	res, status, err := snapshotlocator.FromRequest(r, "/upload-backup-log", h.datastores)
	if err != nil {
		slog.Info("upload-backup-log: locate failed", "error", err)
		http.Error(w, err.Error(), status)
		return
	}

	finalPath := filepath.Join(res.SnapDir, logFileName)
	if _, err := os.Stat(finalPath); err == nil {
		http.Error(w, "client.log.blob already exists", http.StatusConflict)
		return
	}

	body := io.LimitReader(r.Body, int64(maxLogSize)+1)
	tmpPath, written, err := writeTempFile(res.SnapDir, body)
	if err != nil {
		slog.Error("upload-backup-log: write temp failed", "error", err, "snap_dir", res.SnapDir)
		if tmpPath != "" {
			_ = os.Remove(tmpPath)
		}
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}

	if written > maxLogSize {
		_ = os.Remove(tmpPath)
		http.Error(w, fmt.Sprintf("log exceeds maximum size of %d bytes", maxLogSize), http.StatusBadRequest)
		return
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		slog.Error("upload-backup-log: rename failed", "error", err)
		http.Error(w, "rename failed", http.StatusInternalServerError)
		return
	}

	if err := fsyncDir(res.SnapDir); err != nil {
		slog.Warn("upload-backup-log: dir fsync failed (file kept)", "error", err)
	}

	slog.Info("upload-backup-log: written",
		"path", finalPath,
		"size", written,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

func writeTempFile(dir string, body io.Reader) (path string, written int64, err error) {
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return "", 0, fmt.Errorf("random suffix: %w", err)
	}
	tmpPath := filepath.Join(dir, fmt.Sprintf(".client.log.blob.tmp.%s", hex.EncodeToString(suffix)))

	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", 0, fmt.Errorf("open temp: %w", err)
	}

	written, err = io.Copy(f, body)
	if err != nil {
		_ = f.Close()
		return tmpPath, written, fmt.Errorf("copy body: %w", err)
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return tmpPath, written, fmt.Errorf("fsync: %w", err)
	}
	if err := f.Close(); err != nil {
		return tmpPath, written, fmt.Errorf("close: %w", err)
	}
	return tmpPath, written, nil
}

func fsyncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

