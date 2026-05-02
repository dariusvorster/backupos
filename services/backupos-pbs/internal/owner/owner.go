// Package owner manages per-backup-group ownership files.
//
// Each backup group has an owner file at:
//
//	<datastoreRoot>/<backupType>/<backupID>/owner
//
// File contents: <user>@<realm>\n — user-level only, no token suffix.
// Mirrors PBS reference's owner_path layout with V1 simplification
// (user-level ownership, no token-level granularity).
package owner

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrOwnerMismatch is returned when the requested operation's caller
// doesn't match the existing group owner.
var ErrOwnerMismatch = errors.New("backup group owner mismatch")

// ErrInvalidOwnerFile is returned when the owner file exists but its
// contents can't be parsed as user@realm.
var ErrInvalidOwnerFile = errors.New("invalid owner file format")

// Path returns the absolute path to the owner file for a backup group.
//
// Layout: <datastoreRoot>/<backupType>/<backupID>/owner
func Path(datastoreRoot, backupType, backupID string) string {
	return filepath.Join(datastoreRoot, backupType, backupID, "owner")
}

// Read returns the user@realm string stored in the owner file for the
// given group. Returns os.ErrNotExist (wrapped) if the owner file
// doesn't exist — caller decides whether that's allow-by-default
// (V1 backcompat) or deny-by-default (future tightening).
//
// Returns ErrInvalidOwnerFile if the file exists but can't be parsed.
func Read(datastoreRoot, backupType, backupID string) (string, error) {
	path := Path(datastoreRoot, backupType, backupID)
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err // includes wrapped os.ErrNotExist
	}
	line := strings.TrimRight(string(data), "\n")
	if !strings.Contains(line, "@") {
		return "", fmt.Errorf("%w: missing @ separator in %q", ErrInvalidOwnerFile, line)
	}
	// Disallow token name suffix in our V1 owner files.
	if strings.Contains(line, "!") {
		return "", fmt.Errorf("%w: V1 owner files must be user@realm without token name", ErrInvalidOwnerFile)
	}
	return line, nil
}

// SetIfAbsent writes the owner file atomically if it doesn't exist.
// Returns nil if the file was created OR if it already exists with the
// SAME contents (idempotent for the original owner).
//
// Returns ErrOwnerMismatch if the file exists with DIFFERENT contents
// (a different user is trying to write to a group they don't own).
//
// The atomic write is: create owner.tmp, write contents+newline, fsync,
// rename to owner. A crash mid-write leaves owner.tmp orphaned but no
// corrupt owner file.
func SetIfAbsent(datastoreRoot, backupType, backupID, userRealm string) error {
	if !strings.Contains(userRealm, "@") {
		return fmt.Errorf("%w: %q is not user@realm", ErrInvalidOwnerFile, userRealm)
	}
	if strings.Contains(userRealm, "!") {
		return fmt.Errorf("%w: must not include token name", ErrInvalidOwnerFile)
	}

	groupDir := filepath.Join(datastoreRoot, backupType, backupID)
	if err := os.MkdirAll(groupDir, 0o755); err != nil {
		return fmt.Errorf("create group dir: %w", err)
	}

	ownerPath := filepath.Join(groupDir, "owner")

	// Try to read existing owner; if it matches, we're idempotent.
	if existing, err := Read(datastoreRoot, backupType, backupID); err == nil {
		if existing == userRealm {
			return nil // already ours, nothing to do
		}
		return fmt.Errorf("%w: existing=%q, attempted=%q", ErrOwnerMismatch, existing, userRealm)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read existing owner: %w", err)
	}

	// Atomic write.
	tmpPath := ownerPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create owner.tmp: %w", err)
	}
	if _, err := f.WriteString(userRealm + "\n"); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("write owner.tmp: %w", err)
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("fsync owner.tmp: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close owner.tmp: %w", err)
	}
	if err := os.Rename(tmpPath, ownerPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename owner.tmp → owner: %w", err)
	}
	return nil
}

// Check returns nil if userRealm owns the group, ErrOwnerMismatch otherwise.
//
// V1 backwards-compat: if the owner file doesn't exist, returns nil
// (allow). Future versions may flip this to deny-by-default.
func Check(datastoreRoot, backupType, backupID, userRealm string) error {
	existing, err := Read(datastoreRoot, backupType, backupID)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // V1: legacy groups without owner files are allowed
		}
		return err
	}
	if existing != userRealm {
		return fmt.Errorf("%w: owner=%q, requester=%q", ErrOwnerMismatch, existing, userRealm)
	}
	return nil
}
