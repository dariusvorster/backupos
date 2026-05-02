// Package owner manages per-backup-group ownership files.
//
// Each backup group has an owner file at:
//
//	<datastoreRoot>/<backupType>/<backupID>/owner
//
// File contents: <authid>\n where authid is user@realm!tokenname.
// Mirrors PBS reference's owner_path layout and check_backup_owner semantics.
package owner

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

// ErrOwnerMismatch is returned when the requested operation's caller
// doesn't match the existing group owner.
var ErrOwnerMismatch = errors.New("backup group owner mismatch")

// ErrInvalidOwnerFile is returned when the owner file exists but its
// contents can't be parsed as user@realm.
var ErrInvalidOwnerFile = errors.New("invalid owner file format")

// Path returns the absolute path to the owner file for a backup group.
//
// Layout: <ns-path>/<backupType>/<backupID>/owner
func Path(datastoreRoot string, ns namespace.Namespace, backupType, backupID string) string {
	return filepath.Join(ns.JoinPath(datastoreRoot), backupType, backupID, "owner")
}

// Read returns the authid string stored in the owner file for the given group.
// Returns os.ErrNotExist (wrapped) if the owner file doesn't exist.
// Returns ErrInvalidOwnerFile if the file exists but can't be parsed.
func Read(datastoreRoot string, ns namespace.Namespace, backupType, backupID string) (string, error) {
	path := Path(datastoreRoot, ns, backupType, backupID)
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err // includes wrapped os.ErrNotExist
	}
	line := strings.TrimRight(string(data), "\n")
	if !strings.Contains(line, "@") {
		return "", fmt.Errorf("%w: missing @ separator in %q", ErrInvalidOwnerFile, line)
	}
	return line, nil
}

// SetIfAbsent writes the owner file atomically if it doesn't exist.
// Returns nil if the file was created OR if AuthidMatches(existing, authid)
// (idempotent for the original owner and for the token→user direction).
//
// Returns ErrOwnerMismatch if the file exists with non-matching authid.
//
// The atomic write is: create owner.tmp, write contents+newline, fsync,
// rename to owner. A crash mid-write leaves owner.tmp orphaned but no
// corrupt owner file.
func SetIfAbsent(datastoreRoot string, ns namespace.Namespace, backupType, backupID, authid string) error {
	if !strings.Contains(authid, "@") {
		return fmt.Errorf("%w: %q is not a valid authid", ErrInvalidOwnerFile, authid)
	}

	groupDir := filepath.Join(ns.JoinPath(datastoreRoot), backupType, backupID)
	if err := os.MkdirAll(groupDir, 0o755); err != nil {
		return fmt.Errorf("create group dir: %w", err)
	}

	ownerPath := filepath.Join(groupDir, "owner")

	// Try to read existing owner; if it matches, we're idempotent.
	if existing, err := Read(datastoreRoot, ns, backupType, backupID); err == nil {
		if AuthidMatches(existing, authid) {
			return nil // already ours, nothing to do
		}
		return fmt.Errorf("%w: existing=%q, attempted=%q", ErrOwnerMismatch, existing, authid)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read existing owner: %w", err)
	}

	// Atomic write.
	tmpPath := ownerPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create owner.tmp: %w", err)
	}
	if _, err := f.WriteString(authid + "\n"); err != nil {
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

// Check returns nil if callerAuthid matches the stored owner per PBS
// check_backup_owner semantics (AuthidMatches). Returns ErrOwnerMismatch
// if the authids don't match.
//
// V1 backwards-compat: if the owner file doesn't exist, returns nil (allow).
func Check(datastoreRoot string, ns namespace.Namespace, backupType, backupID, callerAuthid string) error {
	existing, err := Read(datastoreRoot, ns, backupType, backupID)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // V1: legacy groups without owner files are allowed
		}
		return err
	}
	if !AuthidMatches(existing, callerAuthid) {
		return fmt.Errorf("%w: owner=%q, requester=%q", ErrOwnerMismatch, existing, callerAuthid)
	}
	return nil
}

// AuthidMatches implements PBS check_backup_owner semantics:
//
//   - stored == caller (exact match)
//   - stored is a token authid (contains "!") AND caller equals the user
//     portion of stored — a bare-user caller can read a token-owned group.
func AuthidMatches(stored, caller string) bool {
	if stored == caller {
		return true
	}
	if bangIdx := strings.Index(stored, "!"); bangIdx != -1 {
		return stored[:bangIdx] == caller
	}
	return false
}
