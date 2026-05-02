// Package gcadmin implements the HTTP handler for the GC admin API.
//
// Routes:
//
//	POST /api2/json/admin/datastore/{store}/gc  → start GC, returns 202 with task_id
//	GET  /api2/json/admin/datastore/{store}/gc  → most recent GC status for datastore
//
// GC runs asynchronously in a goroutine. The handler returns 202 immediately.
// Client disconnect does NOT cancel the GC (context.Background is used).
// A second POST while GC is running returns 409.
package gcadmin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/auth"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/dslock"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcrun"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gctask"
)

// Handler serves the GC admin endpoints.
type Handler struct {
	datastores         *datastore.Lookup
	tracker            *gctask.Tracker
	oldestActiveWriter gcrun.OldestActiveWriterFunc
	// runFn is the GC execution function. Defaults to gcrun.Run; overridable in tests.
	runFn func(ctx context.Context, root string, fn gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error)
}

// NewHandler constructs a Handler.
func NewHandler(
	datastores *datastore.Lookup,
	tracker *gctask.Tracker,
	oldestActiveWriter gcrun.OldestActiveWriterFunc,
) *Handler {
	return &Handler{
		datastores:         datastores,
		tracker:            tracker,
		oldestActiveWriter: oldestActiveWriter,
		runFn:              gcrun.Run,
	}
}

// ServeHTTP dispatches POST (start GC) and GET (status).
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	storeName, ok := extractStore(r.URL.Path)
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "could not extract datastore name from path")
		return
	}

	ds, err := h.datastores.ByName(storeName)
	if err != nil {
		if errors.Is(err, datastore.ErrNotFound) || errors.Is(err, datastore.ErrInvalidName) {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("unknown datastore %q", storeName))
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	identity := auth.FromContext(r.Context())
	if err := auth.AuthorizeDatastore(identity, ds.ID); err != nil {
		writeJSONError(w, http.StatusForbidden, "token not authorized for this datastore")
		return
	}

	switch r.Method {
	case http.MethodPost:
		h.startGC(w, ds)
	case http.MethodGet:
		h.getStatus(w, ds)
	default:
		w.Header().Set("Allow", "POST, GET")
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) startGC(w http.ResponseWriter, ds *datastore.Datastore) {
	task, err := h.tracker.Begin(ds.ID, ds.Name)
	if err != nil {
		if errors.Is(err, gctask.ErrGCAlreadyRunning) {
			writeJSONError(w, http.StatusConflict, "garbage collection already running")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go func(taskID, dsID, dsName, dsRoot string) {
		ctx := context.Background()
		slog.Info("gc started", "task_id", taskID, "datastore", dsName, "datastore_id", dsID)

		status, runErr := h.runFn(ctx, dsRoot, h.oldestActiveWriter)
		if runErr != nil {
			if errors.Is(runErr, dslock.ErrGCBusy) {
				slog.Warn("gc raced with external dslock holder", "task_id", taskID, "datastore_id", dsID)
			}
			h.tracker.Fail(taskID, runErr)
			slog.Info("gc failed", "task_id", taskID, "datastore_id", dsID, "error", runErr.Error())
			return
		}

		h.tracker.Succeed(taskID, status, nil)
		slog.Info("gc succeeded",
			"task_id", taskID,
			"datastore_id", dsID,
			"removed_chunks", status.RemovedChunks,
			"removed_bytes", status.RemovedBytes,
			"disk_chunks", status.DiskChunks,
			"disk_bytes", status.DiskBytes,
		)
	}(task.ID, ds.ID, ds.Name, ds.Path)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]any{
			"task_id":    task.ID,
			"datastore":  ds.Name,
			"state":      task.State,
			"started_at": task.StartedAt.Format(time.RFC3339),
		},
	})
}

func (h *Handler) getStatus(w http.ResponseWriter, ds *datastore.Datastore) {
	latest := h.tracker.Latest(ds.ID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if latest == nil {
		_ = json.NewEncoder(w).Encode(map[string]any{"data": nil})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"data": latest})
}

// extractStore parses /api2/json/admin/datastore/{store}/gc and returns store name.
func extractStore(path string) (string, bool) {
	const prefix = "/api2/json/admin/datastore/"
	const suffix = "/gc"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	middle := strings.TrimPrefix(path, prefix)
	middle = strings.TrimSuffix(middle, suffix)
	if middle == "" || strings.Contains(middle, "/") {
		return "", false
	}
	return middle, true
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
