package gctask

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
)

const (
	dsID   = "ds-uuid-1"
	dsName = "mystore"
	dsID2  = "ds-uuid-2"
	dsRoot = "/tmp/test-root-unused" // placeholder root for nil-persister tests
)

// mockPersister is an in-memory Persister for unit tests.
type mockPersister struct {
	tasks     map[string]*Task
	saveErr   error
	loadErr   error
	saveCalls []*Task
}

func newMockPersister() *mockPersister {
	return &mockPersister{tasks: make(map[string]*Task)}
}

func (m *mockPersister) Save(datastoreID, datastoreRoot string, task *Task) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	cp := *task
	m.tasks[datastoreID] = &cp
	m.saveCalls = append(m.saveCalls, &cp)
	return nil
}

func (m *mockPersister) Load(datastoreID, datastoreRoot string) (*Task, error) {
	if m.loadErr != nil {
		return nil, m.loadErr
	}
	if task, ok := m.tasks[datastoreID]; ok {
		cp := *task
		return &cp, nil
	}
	return nil, nil
}

func TestBegin_CreatesRunningTask(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if task.ID == "" {
		t.Error("expected non-empty task ID")
	}
	if task.State != StateRunning.String() {
		t.Errorf("state: got %q, want %q", task.State, StateRunning.String())
	}
	if task.DatastoreName != dsName {
		t.Errorf("datastore: got %q, want %q", task.DatastoreName, dsName)
	}
}

func TestBegin_Twice_SameDatastore_ReturnsErrGCAlreadyRunning(t *testing.T) {
	tr := NewTracker(nil, nil)
	if _, err := tr.Begin(dsID, dsName); err != nil {
		t.Fatalf("first Begin: %v", err)
	}
	_, err := tr.Begin(dsID, dsName)
	if !errors.Is(err, ErrGCAlreadyRunning) {
		t.Errorf("second Begin: got %v, want ErrGCAlreadyRunning", err)
	}
}

func TestBegin_DifferentDatastores_BothSucceed(t *testing.T) {
	tr := NewTracker(nil, nil)
	t1, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin ds1: %v", err)
	}
	t2, err := tr.Begin(dsID2, "other")
	if err != nil {
		t.Fatalf("Begin ds2: %v", err)
	}
	if t1.ID == t2.ID {
		t.Error("expected distinct task IDs")
	}
}

func TestBegin_AfterFinished_Succeeds(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, _ := tr.Begin(dsID, dsName)
	tr.Succeed(dsID, dsRoot, task.ID, &gcstatus.Status{})

	task2, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin after finish: %v", err)
	}
	if task2.ID == task.ID {
		t.Error("expected a new task ID")
	}
}

func TestBegin_AfterFailed_Succeeds(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, _ := tr.Begin(dsID, dsName)
	tr.Fail(dsID, dsRoot, task.ID, errors.New("boom"))

	_, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin after fail: %v", err)
	}
}

func TestSucceed_TransitionsState(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, _ := tr.Begin(dsID, dsName)
	status := &gcstatus.Status{RemovedChunks: 5, DiskChunks: 10}
	tr.Succeed(dsID, dsRoot, task.ID, status)

	latest := tr.Latest(dsID)
	if latest.State != StateSucceeded.String() {
		t.Errorf("state: got %q, want succeeded", latest.State)
	}
	if latest.FinishedAt == nil {
		t.Error("FinishedAt should be set")
	}
	if latest.Status == nil || latest.Status.RemovedChunks != 5 {
		t.Errorf("Status not copied correctly: %+v", latest.Status)
	}
}

func TestFail_TransitionsState(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, _ := tr.Begin(dsID, dsName)
	tr.Fail(dsID, dsRoot, task.ID, errors.New("disk full"))

	latest := tr.Latest(dsID)
	if latest.State != StateFailed.String() {
		t.Errorf("state: got %q, want failed", latest.State)
	}
	if latest.Error != "disk full" {
		t.Errorf("Error: got %q, want \"disk full\"", latest.Error)
	}
	if latest.FinishedAt == nil {
		t.Error("FinishedAt should be set")
	}
}

func TestLatest_NeverRun_ReturnsNil(t *testing.T) {
	tr := NewTracker(nil, nil)
	if got := tr.Latest(dsID); got != nil {
		t.Errorf("expected nil for unknown datastore, got %+v", got)
	}
}

func TestLatest_ReturnsCopy_MutatingDoesNotAffectTracker(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, _ := tr.Begin(dsID, dsName)
	tr.Succeed(dsID, dsRoot, task.ID, &gcstatus.Status{RemovedChunks: 3})

	cp := tr.Latest(dsID)
	cp.State = "mutated"
	cp.Status.RemovedChunks = 999

	canonical := tr.Latest(dsID)
	if canonical.State != StateSucceeded.String() {
		t.Errorf("tracker state was mutated: got %q", canonical.State)
	}
	if canonical.Status.RemovedChunks != 3 {
		t.Errorf("tracker Status was mutated: got %d", canonical.Status.RemovedChunks)
	}
}

func TestConcurrent_RaceDetectorClean(t *testing.T) {
	tr := NewTracker(nil, nil)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			task, err := tr.Begin(dsID, dsName)
			if err != nil {
				// another goroutine is running — expected
				tr.Latest(dsID)
				return
			}
			time.Sleep(time.Millisecond)
			if i%2 == 0 {
				tr.Succeed(dsID, dsRoot, task.ID, &gcstatus.Status{})
			} else {
				tr.Fail(dsID, dsRoot, task.ID, errors.New("err"))
			}
			tr.Latest(dsID)
		}(i)
	}
	wg.Wait()
}

// ---- Persister tests ----

func TestNewTracker_NoPersister_StillWorks(t *testing.T) {
	tr := NewTracker(nil, nil)
	task, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	tr.Succeed(dsID, dsRoot, task.ID, &gcstatus.Status{})
	if got := tr.Latest(dsID); got == nil || got.State != StateSucceeded.String() {
		t.Errorf("expected succeeded task, got %+v", got)
	}
}

func TestNewTracker_HydratesFromPersister(t *testing.T) {
	mp := newMockPersister()
	// Pre-populate persister with a completed task.
	mp.tasks[dsID] = &Task{
		ID:            "pre-existing",
		DatastoreName: dsName,
		State:         StateSucceeded.String(),
		StartedAt:     time.Now(),
	}

	tr := NewTracker(mp, map[string]string{dsID: dsRoot})

	latest := tr.Latest(dsID)
	if latest == nil {
		t.Fatal("expected hydrated task, got nil")
	}
	if latest.ID != "pre-existing" {
		t.Errorf("ID: got %q, want %q", latest.ID, "pre-existing")
	}
}

func TestNewTracker_PersisterError_DoesntPreventStart(t *testing.T) {
	mp := newMockPersister()
	mp.loadErr = errors.New("disk read failed")

	// Even if Load errors, tracker should be constructed successfully.
	tr := NewTracker(mp, map[string]string{dsID: dsRoot, dsID2: "/tmp/root2"})

	// Both datastores fail to hydrate, but tracker is usable.
	if got := tr.Latest(dsID); got != nil {
		t.Errorf("expected nil for failed hydration, got %+v", got)
	}
	// Begin should work normally.
	if _, err := tr.Begin(dsID, dsName); err != nil {
		t.Errorf("Begin after failed hydration: %v", err)
	}
}

func TestSucceed_PersistsAfterTransition(t *testing.T) {
	mp := newMockPersister()
	tr := NewTracker(mp, nil)

	task, _ := tr.Begin(dsID, dsName)
	status := &gcstatus.Status{RemovedChunks: 7}
	tr.Succeed(dsID, dsRoot, task.ID, status)

	if len(mp.saveCalls) != 1 {
		t.Fatalf("expected 1 Save call, got %d", len(mp.saveCalls))
	}
	saved := mp.saveCalls[0]
	if saved.State != StateSucceeded.String() {
		t.Errorf("persisted state: got %q, want succeeded", saved.State)
	}
	if saved.Status == nil || saved.Status.RemovedChunks != 7 {
		t.Errorf("persisted Status: %+v", saved.Status)
	}
}

func TestFail_PersistsAfterTransition(t *testing.T) {
	mp := newMockPersister()
	tr := NewTracker(mp, nil)

	task, _ := tr.Begin(dsID, dsName)
	tr.Fail(dsID, dsRoot, task.ID, errors.New("atime probe failed"))

	if len(mp.saveCalls) != 1 {
		t.Fatalf("expected 1 Save call, got %d", len(mp.saveCalls))
	}
	saved := mp.saveCalls[0]
	if saved.State != StateFailed.String() {
		t.Errorf("persisted state: got %q, want failed", saved.State)
	}
	if saved.Error != "atime probe failed" {
		t.Errorf("persisted error: got %q", saved.Error)
	}
}

func TestBegin_DoesNotPersist(t *testing.T) {
	mp := newMockPersister()
	tr := NewTracker(mp, nil)

	_, _ = tr.Begin(dsID, dsName)

	if len(mp.saveCalls) != 0 {
		t.Errorf("Begin should not call Save, got %d Save calls", len(mp.saveCalls))
	}
}
