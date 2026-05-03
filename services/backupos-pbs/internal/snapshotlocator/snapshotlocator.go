// Package snapshotlocator provides shared request-parsing helpers for admin
// HTTP handlers that need to resolve a snapshot directory from URL + query.
//
// All three admin endpoints (files, notes, upload-backup-log) share identical
// parameter extraction: store name from path, backup-type/id/time from query.
package snapshotlocator

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/snapshot"
)

const adminPrefix = "/api2/json/admin/datastore/"

// DatastoreLookup is the subset of datastore.Lookup used here.
type DatastoreLookup interface {
	ByName(name string) (*datastore.Datastore, error)
}

// Result holds the resolved snapshot directory and the matching datastore.
type Result struct {
	SnapDir    string
	Datastore  *datastore.Datastore
	BackupTime time.Time
}

// FromRequest extracts the store name from r.URL.Path (trimming suffix),
// parses backup-type/backup-id/backup-time from the query string, looks up
// the datastore, and resolves the existing snapshot directory.
//
// suffix is the trailing path segment, e.g. "/files", "/notes", "/upload-backup-log".
// On error, httpStatus is the appropriate HTTP status code to return.
func FromRequest(r *http.Request, suffix string, lookup DatastoreLookup) (*Result, int, error) {
	rest := strings.TrimPrefix(r.URL.Path, adminPrefix)
	if !strings.HasSuffix(rest, suffix) {
		return nil, http.StatusNotFound, fmt.Errorf("unexpected path suffix")
	}
	store := strings.TrimSuffix(rest, suffix)
	if store == "" || strings.Contains(store, "/") {
		return nil, http.StatusNotFound, fmt.Errorf("invalid store name in path")
	}

	ds, err := lookup.ByName(store)
	if errors.Is(err, datastore.ErrNotFound) {
		return nil, http.StatusNotFound, fmt.Errorf("datastore %q not found", store)
	}
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("datastore lookup: %w", err)
	}

	q := r.URL.Query()
	backupType := q.Get("backup-type")
	backupID := q.Get("backup-id")
	backupTimeRaw := q.Get("backup-time")

	if backupType == "" {
		return nil, http.StatusBadRequest, fmt.Errorf(`missing required parameter "backup-type"`)
	}
	if backupID == "" {
		return nil, http.StatusBadRequest, fmt.Errorf(`missing required parameter "backup-id"`)
	}
	if backupTimeRaw == "" {
		return nil, http.StatusBadRequest, fmt.Errorf(`missing required parameter "backup-time"`)
	}

	tsSeconds, parseErr := strconv.ParseInt(backupTimeRaw, 10, 64)
	if parseErr != nil || tsSeconds <= 0 {
		return nil, http.StatusBadRequest, fmt.Errorf("invalid backup-time")
	}

	backupTime := time.Unix(tsSeconds, 0).UTC()
	ns := namespace.Root()

	snapDir, err := snapshot.ResolveDir(ds.Path, ns, backupType, backupID, backupTime)
	if err != nil {
		var inv *snapshot.ErrInvalidBackupParams
		if errors.As(err, &inv) {
			return nil, http.StatusBadRequest, err
		}
		return nil, http.StatusNotFound, fmt.Errorf("snapshot not found: %w", err)
	}

	return &Result{
		SnapDir:    snapDir,
		Datastore:  ds,
		BackupTime: backupTime,
	}, http.StatusOK, nil
}
