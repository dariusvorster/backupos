package gcsched

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/datastore"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcrun"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gctask"
)

const (
	dsID   = "ds-uuid-1"
	dsName = "mystore"
	dsPath = "/tmp/test-root-unused"
)

func noWriter(_ context.Context) (time.Time, error) { return time.Time{}, nil }

func strPtr(s string) *string { return &s }

func dur(s string) *time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		panic(err)
	}
	return &d
}

// setupDB creates an in-memory SQLite DB with pbs_datastores (including the
// gc_schedule_interval column). If dsID is non-empty, a test datastore row
// is inserted. gcInterval == nil → NULL in DB.
func setupDB(t *testing.T, dsID, dsName, dsPath string, gcInterval *string) (*sql.DB, *datastore.Lookup) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
		CREATE TABLE pbs_datastores (
			id                   TEXT PRIMARY KEY,
			name                 TEXT NOT NULL UNIQUE,
			path                 TEXT NOT NULL,
			created_at           INTEGER NOT NULL,
			gc_schedule_interval TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}
	if dsID != "" {
		var intervalVal any
		if gcInterval != nil {
			intervalVal = *gcInterval
		}
		_, err = db.Exec(
			`INSERT INTO pbs_datastores (id, name, path, created_at, gc_schedule_interval) VALUES (?, ?, ?, ?, ?)`,
			dsID, dsName, dsPath, time.Now().UnixMilli(), intervalVal,
		)
		if err != nil {
			t.Fatal(err)
		}
	}
	return db, datastore.NewLookup(db)
}

// mockPersister is an in-memory Persister for seeding tracker state.
type mockPersister struct {
	tasks map[string]*gctask.Task
}

func (m *mockPersister) Save(_, _ string, _ *gctask.Task) error { return nil }
func (m *mockPersister) Load(dsID, _ string) (*gctask.Task, error) {
	if t, ok := m.tasks[dsID]; ok {
		cp := *t
		return &cp, nil
	}
	return nil, nil
}

// newSched builds a Scheduler suitable for unit tests.
func newSched(lookup *datastore.Lookup, tracker *gctask.Tracker, runFn func(context.Context, string, gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error)) *Scheduler {
	s := New(lookup, tracker, noWriter, time.Hour)
	if runFn != nil {
		s.runFn = runFn
	}
	return s
}

// ----- isDue tests -----

func TestIsDue_NeverRun_True(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	s := &Scheduler{tracker: tracker}
	ds := &datastore.Datastore{ID: dsID, GCScheduleInterval: dur("1h")}
	if !s.isDue(ds, time.Now()) {
		t.Error("expected due for never-run datastore")
	}
}

func TestIsDue_RanRecently_False(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	task, _ := tracker.Begin(dsID, dsName)
	tracker.Succeed(dsID, dsPath, task.ID, &gcstatus.Status{})

	s := &Scheduler{tracker: tracker}
	ds := &datastore.Datastore{ID: dsID, GCScheduleInterval: dur("1h")}
	// FinishedAt ≈ now; nextRun = now + 1h → not due.
	if s.isDue(ds, time.Now()) {
		t.Error("expected not due right after a successful run with 1h interval")
	}
}

func TestIsDue_OverdueByOneSec_True(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	task, _ := tracker.Begin(dsID, dsName)
	tracker.Succeed(dsID, dsPath, task.ID, &gcstatus.Status{})

	s := &Scheduler{tracker: tracker}
	ds := &datastore.Datastore{ID: dsID, GCScheduleInterval: dur("1h")}
	// Advance the clock so nextRun = FinishedAt + 1h < now.
	future := time.Now().Add(time.Hour + time.Second)
	if !s.isDue(ds, future) {
		t.Error("expected due when current time exceeds last_finished_at + interval")
	}
}

func TestIsDue_StillRunning_False(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	_, _ = tracker.Begin(dsID, dsName) // leaves task in running state

	s := &Scheduler{tracker: tracker}
	ds := &datastore.Datastore{ID: dsID, GCScheduleInterval: dur("1ms")}
	if s.isDue(ds, time.Now()) {
		t.Error("expected not due while GC is still running")
	}
}

func TestIsDue_FinishedAtNil_True(t *testing.T) {
	// Seed tracker with a completed task that has no FinishedAt (defensive path).
	mp := &mockPersister{tasks: map[string]*gctask.Task{
		dsID: {
			ID:    "task-seed",
			State: gctask.StateSucceeded.String(),
			// FinishedAt intentionally nil
		},
	}}
	tracker := gctask.NewTracker(mp, map[string]string{dsID: dsPath})

	s := &Scheduler{tracker: tracker}
	ds := &datastore.Datastore{ID: dsID, GCScheduleInterval: dur("1h")}
	if !s.isDue(ds, time.Now()) {
		t.Error("expected due when FinishedAt is nil (defensive path)")
	}
}

// ----- evaluateOnce tests -----

func TestEvaluateOnce_DisabledDatastore_Skipped(t *testing.T) {
	_, lookup := setupDB(t, dsID, dsName, dsPath, nil) // NULL interval = disabled
	tracker := gctask.NewTracker(nil, nil)
	dispatched := false
	s := newSched(lookup, tracker, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		dispatched = true
		return &gcstatus.Status{}, nil
	})

	s.evaluateOnce(context.Background())
	time.Sleep(10 * time.Millisecond) // give any accidental goroutine time to fire

	if dispatched {
		t.Error("runFn should not be called for a datastore with scheduling disabled")
	}
	if task := tracker.Latest(dsID); task != nil {
		t.Errorf("expected no task for disabled datastore, got %+v", task)
	}
}

func TestEvaluateOnce_EnabledAndDue_Dispatches(t *testing.T) {
	_, lookup := setupDB(t, dsID, dsName, dsPath, strPtr("1ms")) // very short interval → due immediately
	tracker := gctask.NewTracker(nil, nil)

	blocking := make(chan struct{})
	s := newSched(lookup, tracker, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		<-blocking
		return &gcstatus.Status{}, nil
	})

	s.evaluateOnce(context.Background())

	// Begin is called synchronously before the goroutine is spawned.
	task := tracker.Latest(dsID)
	if task == nil {
		t.Fatal("expected a task to be started after evaluateOnce")
	}
	if task.State != gctask.StateRunning.String() {
		t.Errorf("state: got %q, want running", task.State)
	}
	close(blocking)
}

func TestEvaluateOnce_EnabledNotDue_Skips(t *testing.T) {
	_, lookup := setupDB(t, dsID, dsName, dsPath, strPtr("24h"))
	tracker := gctask.NewTracker(nil, nil)

	// Prime with a recent success so the 24h interval hasn't elapsed.
	task, _ := tracker.Begin(dsID, dsName)
	tracker.Succeed(dsID, dsPath, task.ID, &gcstatus.Status{})

	dispatched := false
	s := newSched(lookup, tracker, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		dispatched = true
		return &gcstatus.Status{}, nil
	})

	s.evaluateOnce(context.Background())
	time.Sleep(10 * time.Millisecond)

	if dispatched {
		t.Error("runFn should not be called when GC is not yet due")
	}
}

func TestEvaluateOnce_AlreadyRunning_Skips(t *testing.T) {
	// A concurrent manual POST has already called Begin; isDue returns false
	// for state=running, so the scheduler never even calls dispatch.
	_, lookup := setupDB(t, dsID, dsName, dsPath, strPtr("1ms"))
	tracker := gctask.NewTracker(nil, nil)
	_, _ = tracker.Begin(dsID, dsName) // simulate in-flight manual GC

	dispatched := false
	s := newSched(lookup, tracker, func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
		dispatched = true
		return &gcstatus.Status{}, nil
	})

	s.evaluateOnce(context.Background())
	time.Sleep(10 * time.Millisecond)

	if dispatched {
		t.Error("runFn should not be called when a GC is already running")
	}
}

// ----- Run lifecycle test -----

func TestRun_StopsOnContextCancel(t *testing.T) {
	_, lookup := setupDB(t, "", "", "", nil) // no datastores — evaluateOnce is a no-op
	tracker := gctask.NewTracker(nil, nil)
	s := New(lookup, tracker, noWriter, 5*time.Minute)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before Run starts

	done := make(chan struct{})
	go func() {
		s.Run(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("Run did not stop after context was cancelled")
	}
}

// ----- dispatch tests -----

func TestDispatch_FailedRun_TrackerRecordsFailure(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	s := &Scheduler{
		tracker:            tracker,
		oldestActiveWriter: noWriter,
		runFn: func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
			return nil, errors.New("disk full")
		},
	}
	ds := &datastore.Datastore{ID: dsID, Name: dsName, Path: dsPath, GCScheduleInterval: dur("1h")}
	s.dispatch(ds)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		task := tracker.Latest(dsID)
		if task != nil && task.State == gctask.StateFailed.String() {
			if task.Error != "disk full" {
				t.Errorf("error field: got %q, want 'disk full'", task.Error)
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for task to reach failed state")
}

func TestDispatch_SuccessfulRun_TrackerRecordsSuccess(t *testing.T) {
	tracker := gctask.NewTracker(nil, nil)
	s := &Scheduler{
		tracker:            tracker,
		oldestActiveWriter: noWriter,
		runFn: func(_ context.Context, _ string, _ gcrun.OldestActiveWriterFunc) (*gcstatus.Status, error) {
			return &gcstatus.Status{RemovedChunks: 3, DiskChunks: 10}, nil
		},
	}
	ds := &datastore.Datastore{ID: dsID, Name: dsName, Path: dsPath, GCScheduleInterval: dur("1h")}
	s.dispatch(ds)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		task := tracker.Latest(dsID)
		if task != nil && task.State == gctask.StateSucceeded.String() {
			if task.Status == nil || task.Status.RemovedChunks != 3 {
				t.Errorf("Status not recorded correctly: %+v", task.Status)
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for task to reach succeeded state")
}
