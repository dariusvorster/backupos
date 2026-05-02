// Package gcsched runs GC automatically on a per-datastore schedule.
//
// Each datastore can have a gc_schedule_interval column (a Go time.Duration
// string like "24h"). NULL / empty = scheduling disabled for that datastore.
//
// The scheduler ticks every DefaultTickInterval (1 minute) and dispatches a
// GC run for each datastore whose last_finished_at + interval <= now.
// Dispatch goes through gctask.Tracker.Begin, so the ErrGCAlreadyRunning
// guard naturally prevents double-execution with concurrent manual POSTs.
//
// V1 simplifications vs PBS reference:
//   - Interval-based only; no systemd CalendarEvent format.
//   - One global tick interval.
//   - Failed runs retry on the next interval, not on every tick.
package gcsched

import (
	"context"
	"log/slog"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcrun"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gctask"
)

// DefaultTickInterval is how often the scheduler re-evaluates all datastores.
const DefaultTickInterval = 1 * time.Minute

// Scheduler periodically checks each datastore's gc_schedule_interval and
// dispatches a GC run when due.
type Scheduler struct {
	datastores         *datastore.Lookup
	tracker            *gctask.Tracker
	oldestActiveWriter gcrun.OldestActiveWriterFunc
	tick               time.Duration
	// runFn is the GC execution function. Defaults to gcrun.Run; overridable in tests.
	runFn func(ctx context.Context, root string, fn gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error)
}

// New constructs a Scheduler. tick = 0 uses DefaultTickInterval.
func New(
	ds *datastore.Lookup,
	tracker *gctask.Tracker,
	oldest gcrun.OldestActiveWriterFunc,
	tick time.Duration,
) *Scheduler {
	if tick == 0 {
		tick = DefaultTickInterval
	}
	return &Scheduler{
		datastores:         ds,
		tracker:            tracker,
		oldestActiveWriter: oldest,
		tick:               tick,
		runFn:              gcrun.Run,
	}
}

// Run blocks until ctx is cancelled, evaluating schedules every tick.
// It also evaluates immediately on start so a server that's been down a
// while catches up without waiting a full tick.
func (s *Scheduler) Run(ctx context.Context) {
	slog.Info("gc scheduler started", "tick", s.tick)
	ticker := time.NewTicker(s.tick)
	defer ticker.Stop()

	s.evaluateOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			slog.Info("gc scheduler stopped")
			return
		case <-ticker.C:
			s.evaluateOnce(ctx)
		}
	}
}

// evaluateOnce checks every datastore once and dispatches GC for each that
// is due. Each dispatch is fire-and-forget; a stuck GC does not block the
// next tick.
func (s *Scheduler) evaluateOnce(_ context.Context) {
	all, err := s.datastores.All()
	if err != nil {
		slog.Warn("gc scheduler: list datastores failed", "error", err)
		return
	}
	now := time.Now()
	for _, ds := range all {
		if ds.GCScheduleInterval == nil {
			continue
		}
		if !s.isDue(ds, now) {
			continue
		}
		s.dispatch(ds)
	}
}

// isDue returns true when the datastore's next scheduled run has been reached.
//
// Due criteria:
//   - No previous task (never run) → due immediately.
//   - Latest task succeeded or failed → due when finished_at + interval <= now.
//   - Latest task running → not due (Begin will reject anyway).
//   - Latest task exists but FinishedAt is nil → treat as due (defensive).
func (s *Scheduler) isDue(ds *datastore.Datastore, now time.Time) bool {
	latest := s.tracker.Latest(ds.ID)
	if latest == nil {
		return true
	}
	if latest.State == gctask.StateRunning.String() {
		return false
	}
	if latest.FinishedAt == nil {
		return true
	}
	nextRun := latest.FinishedAt.Add(*ds.GCScheduleInterval)
	return !nextRun.After(now)
}

// dispatch begins a GC task and runs it in a goroutine. Errors from Begin
// (e.g. ErrGCAlreadyRunning from a concurrent manual POST) are logged at
// debug level and silently dropped — the scheduler keeps ticking.
func (s *Scheduler) dispatch(ds *datastore.Datastore) {
	task, err := s.tracker.Begin(ds.ID, ds.Name)
	if err != nil {
		slog.Debug("gc scheduler: begin skipped",
			"datastore_id", ds.ID, "reason", err)
		return
	}

	slog.Info("gc scheduler: dispatching",
		"datastore_id", ds.ID,
		"task_id", task.ID,
		"interval", ds.GCScheduleInterval.String())

	go func(taskID, dsID, dsName, dsRoot string) {
		runCtx := context.Background()
		status, runErr := s.runFn(runCtx, dsRoot, s.oldestActiveWriter)
		if runErr != nil {
			s.tracker.Fail(dsID, dsRoot, taskID, runErr)
			slog.Info("gc scheduler: run failed",
				"task_id", taskID, "datastore_id", dsID, "error", runErr.Error())
			return
		}
		s.tracker.Succeed(dsID, dsRoot, taskID, status)
		slog.Info("gc scheduler: run succeeded",
			"task_id", taskID,
			"datastore_id", dsID,
			"removed_chunks", status.RemovedChunks,
			"removed_bytes", status.RemovedBytes,
			"disk_chunks", status.DiskChunks,
		)
	}(task.ID, ds.ID, ds.Name, ds.Path)
}
