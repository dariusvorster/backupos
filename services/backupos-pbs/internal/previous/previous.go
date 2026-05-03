// Package previous locates the most recent successful backup in a group.
//
// A backup is "successful" if its snapshot directory contains at least one
// non-empty .fidx or .didx file — proving the backup wrote real archive data.
// (PBS uses a manifest file for this; V1 uses the archive presence heuristic.)
package previous

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

// Snapshot identifies a previous backup by its directory and timestamp.
type Snapshot struct {
	Time time.Time
	Path string // absolute path to the snapshot directory
}

// ErrNoPrevious is returned by Find when no qualifying previous backup exists.
var ErrNoPrevious = errors.New("no previous successful backup")

// dateRegex matches the backup time directory names used by PBS.
// Example: "2026-05-02T22:55:00Z"
var dateRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`)

// Find returns the most recent successful backup in the given group that
// predates currentBackupTime. Returns ErrNoPrevious if none qualifies.
func Find(datastoreRoot string, ns namespace.Namespace, backupType, backupID string, currentBackupTime time.Time) (*Snapshot, error) {
	groupPath := filepath.Join(ns.JoinPath(datastoreRoot), backupType, backupID)
	entries, err := os.ReadDir(groupPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNoPrevious
		}
		return nil, err
	}

	type candidate struct {
		t    time.Time
		path string
	}
	var candidates []candidate

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !dateRegex.MatchString(name) {
			continue
		}
		t, err := time.Parse(time.RFC3339, name)
		if err != nil {
			continue
		}
		// Skip the current backup and anything at or after it.
		if !t.Before(currentBackupTime) {
			continue
		}
		snapDir := filepath.Join(groupPath, name)
		if !hasIndex(snapDir) {
			continue
		}
		candidates = append(candidates, candidate{t: t, path: snapDir})
	}

	if len(candidates) == 0 {
		return nil, ErrNoPrevious
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].t.After(candidates[j].t)
	})
	return &Snapshot{Time: candidates[0].t, Path: candidates[0].path}, nil
}

// hasIndex returns true if snapDir contains at least one non-empty .fidx or
// .didx file — our heuristic proof that the backup completed real archive work.
func hasIndex(snapDir string) bool {
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		ext := filepath.Ext(name)
		if ext != ".fidx" && ext != ".didx" {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.Size() == 0 {
			continue
		}
		return true
	}
	return false
}
