// Package datastore provides lookups against the pbs_datastores table.
//
// The PBS protocol uses a `?store=<name>` query parameter on backup and
// reader upgrade requests. This package validates that the name maps to
// an existing datastore and returns the row's id + path for downstream use.
//
// Datastore creation is owned by the Node side (M4a UI). The Go service
// is read-only for this table.
package datastore

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"time"
)

// Datastore is a row from pbs_datastores. We only expose the columns
// the Go service needs.
type Datastore struct {
	ID                 string
	Name               string
	Path               string
	CreatedAt          time.Time
	GCScheduleInterval *time.Duration // nil = scheduling disabled
}

// ErrNotFound indicates no row matched the requested name.
var ErrNotFound = errors.New("datastore not found")

// ErrInvalidName indicates the name failed format validation.
var ErrInvalidName = errors.New("invalid datastore name")

// Same regex as the M4a Node-side createPbsDatastore action:
// 1-64 chars, letters/digits/dash/underscore.
var nameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// ValidateName returns ErrInvalidName if the name is not in the expected
// format. It does NOT check existence; use Lookup for that.
//
// Validating shape before hitting the DB lets us reject obvious garbage
// (e.g. ?store=../etc/passwd) without a query.
func ValidateName(name string) error {
	if !nameRegex.MatchString(name) {
		return ErrInvalidName
	}
	return nil
}

// Lookup looks up a datastore by name.
type Lookup struct {
	db *sql.DB
}

// NewLookup constructs a Lookup using the given DB connection.
func NewLookup(db *sql.DB) *Lookup {
	return &Lookup{db: db}
}

// scanner abstracts *sql.Row and *sql.Rows for scanDatastore.
type scanner interface {
	Scan(dest ...any) error
}

// scanDatastore scans a single row from a SELECT of id, name, path, created_at,
// gc_schedule_interval. Parse failures for gc_schedule_interval are non-fatal:
// the field is set to nil and a warning is logged.
func scanDatastore(s scanner) (*Datastore, error) {
	var (
		ds           Datastore
		createdMilli int64
		rawInterval  sql.NullString
	)
	if err := s.Scan(&ds.ID, &ds.Name, &ds.Path, &createdMilli, &rawInterval); err != nil {
		return nil, err
	}
	ds.CreatedAt = time.UnixMilli(createdMilli)
	if rawInterval.Valid && rawInterval.String != "" {
		d, err := time.ParseDuration(rawInterval.String)
		if err != nil {
			slog.Warn("invalid gc_schedule_interval, treating as disabled",
				"datastore_id", ds.ID, "value", rawInterval.String, "error", err)
		} else {
			ds.GCScheduleInterval = &d
		}
	}
	return &ds, nil
}

// All returns every datastore in the table. Used during startup to build
// the per-datastore-ID root map for GC tracker hydration, and by the
// scheduler on each tick.
func (l *Lookup) All() ([]*Datastore, error) {
	const query = `
		SELECT id, name, path, created_at, gc_schedule_interval
		FROM pbs_datastores
	`
	rows, err := l.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("list datastores: %w", err)
	}
	defer rows.Close()
	var dss []*Datastore
	for rows.Next() {
		ds, err := scanDatastore(rows)
		if err != nil {
			return nil, fmt.Errorf("scan datastore: %w", err)
		}
		dss = append(dss, ds)
	}
	return dss, rows.Err()
}

// ByName returns the datastore matching the given name.
//
// Returns ErrInvalidName if the name doesn't match the expected format,
// ErrNotFound if no row matches, or a wrapped error for DB failures.
func (l *Lookup) ByName(name string) (*Datastore, error) {
	if err := ValidateName(name); err != nil {
		return nil, err
	}

	const query = `
		SELECT id, name, path, created_at, gc_schedule_interval
		FROM pbs_datastores
		WHERE name = ?
		LIMIT 1
	`
	ds, err := scanDatastore(l.db.QueryRow(query, name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("datastore lookup: %w", err)
	}
	return ds, nil
}
