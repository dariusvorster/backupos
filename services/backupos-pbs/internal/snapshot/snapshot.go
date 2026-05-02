// Package snapshot implements snapshot directory layout helpers for the
// PBS protocol. Per the PBS spec, snapshots live at:
//
//	<datastore-root>/<backup-type>/<backup-id>/<backup-time-ISO>/
//
// The Go service creates the snapshot directory lazily on first write
// (blob, index, etc.) so aborted sessions leave no filesystem footprint.
package snapshot

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// backupIDRegex matches the same constraints upgrade.ParseParams enforces.
// Defensive: reject path traversal even if the upgrade handler somehow missed it.
var backupIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,64}$`)

// validBackupTypes is the set of allowed backup-type values per PBS spec.
var validBackupTypes = map[string]bool{
	"vm":   true,
	"ct":   true,
	"host": true,
}

// ErrInvalidBackupParams indicates one of the snapshot path components failed validation.
type ErrInvalidBackupParams struct{ Reason string }

func (e *ErrInvalidBackupParams) Error() string { return e.Reason }

// Path returns the canonical filesystem path for the snapshot identified by
// the given parameters. Validates inputs and returns ErrInvalidBackupParams
// on any failure.
//
// The PBS time format is RFC3339 with second precision and no fractional
// seconds, suffixed with Z (e.g. "2024-12-24T00:26:40Z"). The timestamp is
// always normalized to UTC.
func Path(datastoreRoot, backupType, backupID string, backupTime time.Time) (string, error) {
	if !validBackupTypes[backupType] {
		return "", &ErrInvalidBackupParams{Reason: fmt.Sprintf("invalid backup-type %q", backupType)}
	}
	if !backupIDRegex.MatchString(backupID) {
		return "", &ErrInvalidBackupParams{Reason: fmt.Sprintf("invalid backup-id %q", backupID)}
	}
	timeStr := backupTime.UTC().Format("2006-01-02T15:04:05Z")
	return filepath.Join(datastoreRoot, backupType, backupID, timeStr), nil
}

// EnsureDir returns the canonical snapshot path AND ensures it exists on
// disk (creating parent directories as needed). Idempotent — safe to call
// multiple times for the same snapshot.
func EnsureDir(datastoreRoot, backupType, backupID string, backupTime time.Time) (string, error) {
	p, err := Path(datastoreRoot, backupType, backupID, backupTime)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(p, 0o755); err != nil {
		return "", fmt.Errorf("mkdir snapshot dir: %w", err)
	}
	return p, nil
}

// ResolveDir returns the absolute path to an existing snapshot directory, or
// an error if it doesn't exist. Unlike EnsureDir, this never creates anything.
// Used by reader sessions which require the snapshot to already exist.
func ResolveDir(datastoreRoot, backupType, backupID string, backupTime time.Time) (string, error) {
	p, err := Path(datastoreRoot, backupType, backupID, backupTime)
	if err != nil {
		return "", err
	}
	st, err := os.Stat(p)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("snapshot does not exist: %s/%s/%s",
				backupType, backupID, backupTime.UTC().Format("2006-01-02T15:04:05Z"))
		}
		return "", fmt.Errorf("stat snapshot: %w", err)
	}
	if !st.IsDir() {
		return "", fmt.Errorf("snapshot path is not a directory: %s", p)
	}
	return p, nil
}
