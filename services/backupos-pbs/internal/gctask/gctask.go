// Package gctask tracks in-memory state for GC runs, one per datastore.
//
// The Tracker holds the most recent task per datastore ID. Running tasks are
// in-memory only. Succeeded and failed tasks are persisted via the optional
// Persister (see FilePersister for the disk-backed implementation).
package gctask

import (
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcmark"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
)

// State is the lifecycle state of a GC task.
type State int

const (
	StateRunning State = iota
	StateSucceeded
	StateFailed
)

func (s State) String() string {
	switch s {
	case StateRunning:
		return "running"
	case StateSucceeded:
		return "succeeded"
	case StateFailed:
		return "failed"
	}
	return "unknown"
}

// Task is a snapshot of a single GC run for one datastore.
type Task struct {
	ID            string           `json:"task_id"`
	DatastoreName string           `json:"datastore"`
	State         string           `json:"state"`
	StartedAt     time.Time        `json:"started_at"`
	FinishedAt    *time.Time       `json:"finished_at,omitempty"`
	Status        *gcstatus.Status `json:"status,omitempty"`
	MarkStats     *gcmark.Stats    `json:"mark_stats,omitempty"`
	Error         string           `json:"error,omitempty"`
}

// Persister abstracts where Task records are written/read so tests
// can use an in-memory persister and prod uses a disk-backed one.
type Persister interface {
	// Save writes the task for this datastore. Failures are non-fatal
	// for GC correctness — caller logs but doesn't propagate.
	Save(datastoreID, datastoreRoot string, task *Task) error

	// Load returns the previously-persisted task for this datastore,
	// or (nil, nil) if no record exists (fresh datastore).
	Load(datastoreID, datastoreRoot string) (*Task, error)
}

// ErrGCAlreadyRunning is returned by Begin when a task is already running
// for the requested datastore. The caller should translate this to HTTP 409.
var ErrGCAlreadyRunning = errors.New("gc already running on this datastore")

// Tracker holds the most recent GC task per datastore ID.
type Tracker struct {
	mu        sync.Mutex
	perDS     map[string]*Task // keyed by datastore ID
	persister Persister        // optional; nil disables persistence
}

// NewTracker creates a tracker. If persister is non-nil and datastoreRoots
// is non-empty, the tracker hydrates from disk for each provided datastore
// before returning.
//
// Hydration failures are logged but don't prevent tracker creation —
// a corrupt .gc-status file shouldn't keep the server from starting.
func NewTracker(persister Persister, datastoreRoots map[string]string) *Tracker {
	t := &Tracker{
		perDS:     make(map[string]*Task),
		persister: persister,
	}
	if persister != nil {
		for dsID, dsRoot := range datastoreRoots {
			task, err := persister.Load(dsID, dsRoot)
			if err != nil {
				slog.Warn("hydrate gc tracker failed", "datastore_id", dsID, "error", err)
				continue
			}
			if task != nil {
				t.perDS[dsID] = task
				slog.Info("hydrated gc tracker", "datastore_id", dsID, "state", task.State)
			}
		}
	}
	return t
}

// Begin creates a new running task for the datastore identified by datastoreID.
// Returns ErrGCAlreadyRunning if a task is already in state "running".
// The datastoreName is stored for display purposes.
func (t *Tracker) Begin(datastoreID, datastoreName string) (*Task, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if existing, ok := t.perDS[datastoreID]; ok && existing.State == StateRunning.String() {
		return nil, ErrGCAlreadyRunning
	}
	task := &Task{
		ID:            uuid.NewString(),
		DatastoreName: datastoreName,
		State:         StateRunning.String(),
		StartedAt:     time.Now(),
	}
	t.perDS[datastoreID] = task
	return task, nil
}

// Succeed transitions the task with the given taskID to succeeded and
// persists the result if a Persister is configured.
func (t *Tracker) Succeed(datastoreID, datastoreRoot, taskID string, status *gcstatus.Status) {
	t.mu.Lock()
	task := t.findByID(taskID)
	if task == nil {
		t.mu.Unlock()
		return
	}
	now := time.Now()
	task.State = StateSucceeded.String()
	task.FinishedAt = &now
	task.Status = status
	snapshot := *task
	if status != nil {
		s := *status
		snapshot.Status = &s
	}
	t.mu.Unlock()

	if t.persister != nil {
		if err := t.persister.Save(datastoreID, datastoreRoot, &snapshot); err != nil {
			slog.Warn("persist gc task failed", "datastore_id", datastoreID, "task_id", taskID, "error", err)
		}
	}
}

// Fail transitions the task with the given taskID to failed and
// persists the result if a Persister is configured.
func (t *Tracker) Fail(datastoreID, datastoreRoot, taskID string, err error) {
	t.mu.Lock()
	task := t.findByID(taskID)
	if task == nil {
		t.mu.Unlock()
		return
	}
	now := time.Now()
	task.State = StateFailed.String()
	task.FinishedAt = &now
	task.Error = err.Error()
	snapshot := *task
	t.mu.Unlock()

	if t.persister != nil {
		if saveErr := t.persister.Save(datastoreID, datastoreRoot, &snapshot); saveErr != nil {
			slog.Warn("persist gc task failed", "datastore_id", datastoreID, "task_id", taskID, "error", saveErr)
		}
	}
}

// Latest returns a defensive copy of the most recent task for the datastore,
// or nil if no GC has been run for this datastore since process start.
func (t *Tracker) Latest(datastoreID string) *Task {
	t.mu.Lock()
	defer t.mu.Unlock()
	task, ok := t.perDS[datastoreID]
	if !ok {
		return nil
	}
	cp := *task
	if task.Status != nil {
		s := *task.Status
		cp.Status = &s
	}
	if task.MarkStats != nil {
		m := *task.MarkStats
		cp.MarkStats = &m
	}
	return &cp
}

func (t *Tracker) findByID(taskID string) *Task {
	for _, task := range t.perDS {
		if task.ID == taskID {
			return task
		}
	}
	return nil
}
