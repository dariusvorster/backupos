// Package upgrade implements the PBS HTTP/1.1 → HTTP/2 upgrade handshake.
//
// PBS uses a custom Upgrade token "proxmox-backup-protocol-v1" (NOT h2c).
// After the handshake, the connection speaks normal HTTP/2 — Go's stdlib
// HTTP/2 server handles streams via http2.Server.ServeConn.
package upgrade

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

// BackupType identifies the kind of backup target.
type BackupType string

const (
	BackupTypeVM   BackupType = "vm"
	BackupTypeCT   BackupType = "ct"
	BackupTypeHost BackupType = "host"
)

// Params is the parsed and validated query string from a PBS upgrade request.
type Params struct {
	Store      string
	BackupType BackupType
	BackupID   string
	BackupTime time.Time
	Namespace  string // optional; empty if not provided
}

// ErrInvalidParams indicates the upgrade request query string failed validation.
// The wrapped error contains the human-readable reason.
type ErrInvalidParams struct {
	Reason string
}

func (e *ErrInvalidParams) Error() string {
	return e.Reason
}

// invalidErr returns an ErrInvalidParams with the given reason.
func invalidErr(format string, args ...any) error {
	return &ErrInvalidParams{Reason: fmt.Sprintf(format, args...)}
}

// IsInvalidParams reports whether err is an ErrInvalidParams.
func IsInvalidParams(err error) bool {
	var e *ErrInvalidParams
	return errors.As(err, &e)
}

var (
	// store: 1-64 chars, letters/digits/dash/underscore. Same as datastore.ValidateName.
	storeRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
	// backup-id: 1-64 chars, letters/digits/dot/dash/underscore.
	backupIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,64}$`)
	// ns: 0-256 chars, letters/digits/slash/dot/dash/underscore.
	nsRegex = regexp.MustCompile(`^[a-zA-Z0-9_/.-]{0,256}$`)
)

const (
	// Plausible-time range for backup-time. Not before 2010, not after year 3000.
	minBackupTimeSec = int64(1262304000)
	maxBackupTimeSec = int64(32503680000)
)

// ParseParams parses and validates the query string from a PBS upgrade request.
//
// Input: the URL from the http.Request (r.URL).
//
// Returns ErrInvalidParams (via IsInvalidParams) for any validation failure;
// the wrapped Reason is suitable for inclusion in a 400 response body.
func ParseParams(u *url.URL) (*Params, error) {
	q := u.Query()

	store := q.Get("store")
	backupType := q.Get("backup-type")
	backupID := q.Get("backup-id")
	backupTimeRaw := q.Get("backup-time")
	ns := q.Get("ns")

	if store == "" {
		return nil, invalidErr(`missing required parameter "store"`)
	}
	if backupType == "" {
		return nil, invalidErr(`missing required parameter "backup-type"`)
	}
	if backupID == "" {
		return nil, invalidErr(`missing required parameter "backup-id"`)
	}
	if backupTimeRaw == "" {
		return nil, invalidErr(`missing required parameter "backup-time"`)
	}

	if !storeRegex.MatchString(store) {
		return nil, invalidErr(`invalid "store" parameter`)
	}

	bt := BackupType(backupType)
	switch bt {
	case BackupTypeVM, BackupTypeCT, BackupTypeHost:
		// ok
	default:
		return nil, invalidErr(`invalid "backup-type" — must be one of vm, ct, host`)
	}

	if !backupIDRegex.MatchString(backupID) {
		return nil, invalidErr(`invalid "backup-id" — letters, digits, dot, dash, underscore (1-64 chars)`)
	}

	backupTimeSec, err := strconv.ParseInt(backupTimeRaw, 10, 64)
	if err != nil || backupTimeSec < 0 {
		return nil, invalidErr(`invalid "backup-time" — must be a positive integer`)
	}
	if backupTimeSec < minBackupTimeSec || backupTimeSec > maxBackupTimeSec {
		return nil, invalidErr(`"backup-time" out of plausible range`)
	}

	if ns != "" && !nsRegex.MatchString(ns) {
		return nil, invalidErr(`invalid "ns" — only letters, digits, slash, dot, dash, underscore (max 256 chars)`)
	}

	return &Params{
		Store:      store,
		BackupType: bt,
		BackupID:   backupID,
		BackupTime: time.Unix(backupTimeSec, 0),
		Namespace:  ns,
	}, nil
}
