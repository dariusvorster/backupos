// Package blob implements the POST /blob endpoint of the PBS backup protocol.
//
// Wire format:
//
//	POST /blob?file-name=<name>.blob&encoded-size=<N> HTTP/2
//	<body: N bytes of opaque blob data>
//
// The server treats the body as opaque — PBS uses a 12-byte magic header +
// zstd payload, but we don't parse it. We just write the bytes atomically
// into the snapshot directory at <snapshot-dir>/<file-name>.
package blob

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/streamctx"
)

// maxBlobSize is a generous safety bound to avoid unbounded reads on a
// misbehaving client. Realistic PBS blobs are <1 MiB.
const maxBlobSize int64 = 256 * 1024 * 1024 // 256 MiB

// fileNameRegex matches valid blob file names. Must end in .blob.
var fileNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.blob$`)

type errBadRequest struct{ msg string }

func (e *errBadRequest) Error() string { return e.msg }

// Handler implements POST /blob.
type Handler struct{}

// NewHandler constructs a blob handler.
func NewHandler() *Handler {
	return &Handler{}
}

// ServeHTTP routes POST /blob → upload; any other method → 405.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	sc := streamctx.FromRequest(r)
	if sc == nil {
		slog.Error("blob handler invoked without streamctx")
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	fileName, encodedSize, err := parseQuery(r.URL.Query())
	if err != nil {
		var bad *errBadRequest
		if errors.As(err, &bad) {
			slog.Info("blob rejected: bad request",
				"reason", bad.msg,
				"session_id", sc.SessionID,
				"remote", r.RemoteAddr,
			)
			writeError(w, http.StatusBadRequest, bad.msg)
			return
		}
		slog.Error("blob query parse failed", "error", err, "session_id", sc.SessionID)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	snapDir, err := snapshot.EnsureDir(sc.DatastoreRoot, sc.BackupType, sc.BackupID, sc.BackupTime)
	if err != nil {
		slog.Error("snapshot dir ensure failed",
			"error", err,
			"session_id", sc.SessionID,
			"datastore_root", sc.DatastoreRoot,
		)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// +1 to detect over-cap without reading the full excess into memory
	body := io.LimitReader(r.Body, maxBlobSize+1)
	tmpPath, written, err := writeTempFile(snapDir, fileName, body)
	if err != nil {
		slog.Error("blob write failed",
			"error", err,
			"session_id", sc.SessionID,
			"file_name", fileName,
		)
		if tmpPath != "" {
			_ = os.Remove(tmpPath)
		}
		writeError(w, http.StatusInternalServerError, "write failed")
		return
	}

	if written > maxBlobSize {
		_ = os.Remove(tmpPath)
		slog.Info("blob rejected: size exceeds cap",
			"session_id", sc.SessionID,
			"file_name", fileName,
			"max", maxBlobSize,
			"written", written,
		)
		writeError(w, http.StatusBadRequest, fmt.Sprintf("blob exceeds maximum size of %d bytes", maxBlobSize))
		return
	}

	if written != encodedSize {
		_ = os.Remove(tmpPath)
		slog.Info("blob rejected: size mismatch",
			"session_id", sc.SessionID,
			"file_name", fileName,
			"expected", encodedSize,
			"actual", written,
		)
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("body size %d does not match encoded-size %d", written, encodedSize))
		return
	}

	finalPath := filepath.Join(snapDir, fileName)
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		slog.Error("blob rename failed",
			"error", err,
			"session_id", sc.SessionID,
			"file_name", fileName,
		)
		writeError(w, http.StatusInternalServerError, "rename failed")
		return
	}

	// fsync parent dir so the rename is durable on power loss.
	if err := fsyncDir(snapDir); err != nil {
		slog.Warn("blob parent fsync failed (file kept)",
			"error", err,
			"session_id", sc.SessionID,
			"snapshot_dir", snapDir,
		)
	}

	slog.Info("blob written",
		"session_id", sc.SessionID,
		"file_name", fileName,
		"size", written,
		"path", finalPath,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"data":null}`))
}

// parseQuery extracts and validates ?file-name and ?encoded-size.
func parseQuery(q map[string][]string) (fileName string, encodedSize int64, err error) {
	getOne := func(k string) string {
		v := q[k]
		if len(v) == 0 {
			return ""
		}
		return v[0]
	}

	fileName = getOne("file-name")
	if fileName == "" {
		return "", 0, &errBadRequest{`missing required parameter "file-name"`}
	}
	if !fileNameRegex.MatchString(fileName) {
		return "", 0, &errBadRequest{`invalid "file-name" — must match [A-Za-z0-9_.-]+\.blob`}
	}
	if len(fileName) > 128 {
		return "", 0, &errBadRequest{`"file-name" too long (max 128 chars)`}
	}

	encodedSizeRaw := getOne("encoded-size")
	if encodedSizeRaw == "" {
		return "", 0, &errBadRequest{`missing required parameter "encoded-size"`}
	}
	encodedSize, err = strconv.ParseInt(encodedSizeRaw, 10, 64)
	if err != nil || encodedSize < 0 {
		return "", 0, &errBadRequest{`invalid "encoded-size" — must be a non-negative integer`}
	}
	if encodedSize > maxBlobSize {
		return "", 0, &errBadRequest{fmt.Sprintf(`"encoded-size" exceeds maximum of %d`, maxBlobSize)}
	}

	return fileName, encodedSize, nil
}

// writeTempFile streams body into a temp file inside dir. Returns the temp
// path and bytes written. Caller removes the temp file on any failure path.
func writeTempFile(dir, baseName string, body io.Reader) (path string, written int64, err error) {
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return "", 0, fmt.Errorf("random suffix: %w", err)
	}
	tmpName := fmt.Sprintf(".%s.tmp.%s", baseName, hex.EncodeToString(suffix))
	tmpPath := filepath.Join(dir, tmpName)

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

// fsyncDir fsyncs a directory inode for durability of recent renames.
func fsyncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

// writeError emits a standard JSON error response.
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
