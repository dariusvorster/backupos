package gctask

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/gcstatus"
)

func sampleTask() *Task {
	now := time.Now().UTC().Truncate(time.Millisecond)
	finished := now.Add(time.Second)
	return &Task{
		ID:            "test-task-id",
		DatastoreName: "mystore",
		State:         StateSucceeded.String(),
		StartedAt:     now,
		FinishedAt:    &finished,
		Status: &gcstatus.Status{
			RemovedChunks: 1,
			RemovedBytes:  28,
			DiskChunks:    6,
			DiskBytes:     12058712,
		},
	}
}

func TestFilePersister_Save_NewFile_WritesJSON(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	if err := p.Save("ds-1", root, sampleTask()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(root, statusFilename))
	if err != nil {
		t.Fatalf("file not written: %v", err)
	}
	var got Task
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("invalid JSON: %v\nbody: %s", err, data)
	}
	if got.ID != "test-task-id" {
		t.Errorf("task_id: got %q, want %q", got.ID, "test-task-id")
	}
	if got.State != StateSucceeded.String() {
		t.Errorf("state: got %q, want succeeded", got.State)
	}
}

func TestFilePersister_Save_ExistingFile_Overwrites(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	first := sampleTask()
	first.ID = "first"
	if err := p.Save("ds-1", root, first); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	second := sampleTask()
	second.ID = "second"
	if err := p.Save("ds-1", root, second); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	loaded, err := p.Load("ds-1", root)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.ID != "second" {
		t.Errorf("expected second task to overwrite first, got ID=%q", loaded.ID)
	}
}

func TestFilePersister_Save_AtomicWrite_NoTmpAfterSuccess(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	if err := p.Save("ds-1", root, sampleTask()); err != nil {
		t.Fatalf("Save: %v", err)
	}

	tmpPath := filepath.Join(root, statusFilename+".tmp")
	if _, err := os.Stat(tmpPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("tmp file should not exist after successful Save, got: %v", err)
	}
}

func TestFilePersister_Save_DirectoryDoesNotExist_Errors(t *testing.T) {
	p := FilePersister{}
	err := p.Save("ds-1", "/nonexistent/path/that/does/not/exist", sampleTask())
	if err == nil {
		t.Error("expected error for nonexistent directory, got nil")
	}
}

func TestFilePersister_Load_NonExistent_ReturnsNilNil(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	task, err := p.Load("ds-1", root)
	if err != nil {
		t.Fatalf("expected nil error for missing file, got %v", err)
	}
	if task != nil {
		t.Errorf("expected nil task for missing file, got %+v", task)
	}
}

func TestFilePersister_Load_ValidFile_ReturnsTask(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	want := sampleTask()
	if err := p.Save("ds-1", root, want); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := p.Load("ds-1", root)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.State != want.State {
		t.Errorf("State: got %q, want %q", got.State, want.State)
	}
}

func TestFilePersister_Load_CorruptJSON_ReturnsError(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	if err := os.WriteFile(filepath.Join(root, statusFilename), []byte("not-json"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := p.Load("ds-1", root)
	if err == nil {
		t.Error("expected error for corrupt JSON, got nil")
	}
}

func TestFilePersister_RoundTrip(t *testing.T) {
	root := t.TempDir()
	p := FilePersister{}

	want := sampleTask()
	if err := p.Save("ds-1", root, want); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := p.Load("ds-1", root)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.DatastoreName != want.DatastoreName {
		t.Errorf("DatastoreName: got %q, want %q", got.DatastoreName, want.DatastoreName)
	}
	if got.State != want.State {
		t.Errorf("State: got %q, want %q", got.State, want.State)
	}
	if got.Status == nil {
		t.Fatal("Status should not be nil after round-trip")
	}
	if got.Status.RemovedChunks != want.Status.RemovedChunks {
		t.Errorf("RemovedChunks: got %d, want %d", got.Status.RemovedChunks, want.Status.RemovedChunks)
	}
	if got.Status.DiskBytes != want.Status.DiskBytes {
		t.Errorf("DiskBytes: got %d, want %d", got.Status.DiskBytes, want.Status.DiskBytes)
	}
	if got.FinishedAt == nil {
		t.Error("FinishedAt should survive round-trip")
	}
}
