// Package files implements GET /api2/json/admin/datastore/<store>/files.
//
// PVE calls this endpoint to list the archives inside a snapshot so it can
// display file sizes and allow per-archive download. We return a sorted list
// of .blob / .didx / .fidx entries with crypt-mode "none" (we don't encrypt).
package files

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshotlocator"
)

// fileEntry mirrors the PBS API shape for one archive file.
type fileEntry struct {
	Filename  string `json:"filename"`
	Size      int64  `json:"size"`
	CryptMode string `json:"crypt-mode"`
}

// archiveExts is the set of file extensions we expose.
var archiveExts = map[string]bool{
	".blob": true,
	".didx": true,
	".fidx": true,
}

// Handler serves GET /api2/json/admin/datastore/<store>/files.
type Handler struct {
	datastores *datastore.Lookup
}

// NewHandler constructs a files Handler.
func NewHandler(ds *datastore.Lookup) *Handler {
	return &Handler{datastores: ds}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	res, status, err := snapshotlocator.FromRequest(r, "/files", h.datastores)
	if err != nil {
		slog.Info("files: bad request", "error", err, "path", r.URL.Path)
		http.Error(w, err.Error(), status)
		return
	}

	entries, err := listArchives(res.SnapDir)
	if err != nil {
		slog.Error("files: readdir failed", "error", err, "snap_dir", res.SnapDir)
		http.Error(w, "readdir failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"data": entries})
}

func listArchives(snapDir string) ([]fileEntry, error) {
	des, err := os.ReadDir(snapDir)
	if err != nil {
		return nil, err
	}

	var entries []fileEntry
	for _, de := range des {
		if de.IsDir() {
			continue
		}
		ext := filepath.Ext(de.Name())
		if !archiveExts[ext] {
			continue
		}
		info, err := de.Info()
		if err != nil {
			continue
		}
		entries = append(entries, fileEntry{
			Filename:  de.Name(),
			Size:      info.Size(),
			CryptMode: "none",
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Filename < entries[j].Filename
	})

	if entries == nil {
		entries = []fileEntry{}
	}
	return entries, nil
}
