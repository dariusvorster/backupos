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
)

func TestBegin_CreatesRunningTask(t *testing.T) {
	tr := NewTracker()
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
	tr := NewTracker()
	if _, err := tr.Begin(dsID, dsName); err != nil {
		t.Fatalf("first Begin: %v", err)
	}
	_, err := tr.Begin(dsID, dsName)
	if !errors.Is(err, ErrGCAlreadyRunning) {
		t.Errorf("second Begin: got %v, want ErrGCAlreadyRunning", err)
	}
}

func TestBegin_DifferentDatastores_BothSucceed(t *testing.T) {
	tr := NewTracker()
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
	tr := NewTracker()
	task, _ := tr.Begin(dsID, dsName)
	tr.Succeed(task.ID, &gcstatus.Status{}, nil)

	task2, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin after finish: %v", err)
	}
	if task2.ID == task.ID {
		t.Error("expected a new task ID")
	}
}

func TestBegin_AfterFailed_Succeeds(t *testing.T) {
	tr := NewTracker()
	task, _ := tr.Begin(dsID, dsName)
	tr.Fail(task.ID, errors.New("boom"))

	_, err := tr.Begin(dsID, dsName)
	if err != nil {
		t.Fatalf("Begin after fail: %v", err)
	}
}

func TestSucceed_TransitionsState(t *testing.T) {
	tr := NewTracker()
	task, _ := tr.Begin(dsID, dsName)
	status := &gcstatus.Status{RemovedChunks: 5, DiskChunks: 10}
	tr.Succeed(task.ID, status, nil)

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
	tr := NewTracker()
	task, _ := tr.Begin(dsID, dsName)
	tr.Fail(task.ID, errors.New("disk full"))

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
	tr := NewTracker()
	if got := tr.Latest(dsID); got != nil {
		t.Errorf("expected nil for unknown datastore, got %+v", got)
	}
}

func TestLatest_ReturnsCopy_MutatingDoesNotAffectTracker(t *testing.T) {
	tr := NewTracker()
	task, _ := tr.Begin(dsID, dsName)
	tr.Succeed(task.ID, &gcstatus.Status{RemovedChunks: 3}, nil)

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
	tr := NewTracker()
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
				tr.Succeed(task.ID, &gcstatus.Status{}, nil)
			} else {
				tr.Fail(task.ID, errors.New("err"))
			}
			tr.Latest(dsID)
		}(i)
	}
	wg.Wait()
}
