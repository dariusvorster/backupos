// Package gctask tracks in-memory state for GC runs, one per datastore.
//
// The Tracker holds the most recent task per datastore name. When a new GC
// starts, any completed task for that datastore is replaced. State is
// ephemeral — a server restart loses task history; the GC itself already ran
// or didn't.
package gctask

import (
	"errors"
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

// ErrGCAlreadyRunning is returned by Begin when a task is already running
// for the requested datastore. The caller should translate this to HTTP 409.
var ErrGCAlreadyRunning = errors.New("gc already running on this datastore")

// Tracker holds the most recent GC task per datastore ID.
type Tracker struct {
	mu    sync.Mutex
	perDS map[string]*Task // keyed by datastore ID
}

// NewTracker constructs an empty Tracker.
func NewTracker() *Tracker {
	return &Tracker{perDS: make(map[string]*Task)}
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

// Succeed transitions the task with the given taskID to succeeded.
func (t *Tracker) Succeed(taskID string, status *gcstatus.Status, markStats *gcmark.Stats) {
	t.mu.Lock()
	defer t.mu.Unlock()
	task := t.findByID(taskID)
	if task == nil {
		return
	}
	now := time.Now()
	task.State = StateSucceeded.String()
	task.FinishedAt = &now
	task.Status = status
	task.MarkStats = markStats
}

// Fail transitions the task with the given taskID to failed.
func (t *Tracker) Fail(taskID string, err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	task := t.findByID(taskID)
	if task == nil {
		return
	}
	now := time.Now()
	task.State = StateFailed.String()
	task.FinishedAt = &now
	task.Error = err.Error()
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
