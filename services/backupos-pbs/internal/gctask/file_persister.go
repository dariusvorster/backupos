package gctask

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// FilePersister stores Task records as JSON in <datastoreRoot>/.gc-status.
// Atomic writes via tmp+rename so a crash mid-write can't corrupt the file.
type FilePersister struct{}

// statusFilename matches PBS reference layout (pbs-datastore/src/datastore.rs).
const statusFilename = ".gc-status"

func (FilePersister) path(datastoreRoot string) string {
	return filepath.Join(datastoreRoot, statusFilename)
}

// Save writes task to <datastoreRoot>/.gc-status atomically.
func (p FilePersister) Save(datastoreID, datastoreRoot string, task *Task) error {
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal task: %w", err)
	}

	finalPath := p.path(datastoreRoot)
	tmpPath := finalPath + ".tmp"

	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create %s: %w", tmpPath, err)
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("write %s: %w", tmpPath, err)
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("fsync %s: %w", tmpPath, err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename %s → %s: %w", tmpPath, finalPath, err)
	}
	return nil
}

// Load reads <datastoreRoot>/.gc-status and returns the stored Task.
// Returns (nil, nil) if the file does not exist (fresh datastore).
func (p FilePersister) Load(datastoreID, datastoreRoot string) (*Task, error) {
	data, err := os.ReadFile(p.path(datastoreRoot))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil // no record = fresh datastore, not an error
		}
		return nil, fmt.Errorf("read .gc-status: %w", err)
	}
	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, fmt.Errorf("unmarshal .gc-status: %w", err)
	}
	return &task, nil
}
