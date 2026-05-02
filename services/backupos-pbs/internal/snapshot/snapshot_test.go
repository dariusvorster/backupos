package snapshot

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dariusvorster/backupos/services/backupos-pbs/internal/namespace"
)

func TestPath_Valid(t *testing.T) {
	p, err := Path("/data", namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	want := "/data/vm/100/2024-12-24T00:26:40Z"
	if p != want {
		t.Errorf("Path: got %q, want %q", p, want)
	}
}

func TestPath_NormalizesToUTC(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	t1 := time.Unix(1735000000, 0).In(loc)
	p, err := Path("/data", namespace.Root(), "vm", "100", t1)
	if err != nil {
		t.Fatal(err)
	}
	want := "/data/vm/100/2024-12-24T00:26:40Z"
	if p != want {
		t.Errorf("Path: got %q, want %q", p, want)
	}
}

func TestPath_RejectsInvalidBackupType(t *testing.T) {
	_, err := Path("/data", namespace.Root(), "tape", "100", time.Unix(1735000000, 0))
	var e *ErrInvalidBackupParams
	if !errors.As(err, &e) {
		t.Errorf("expected ErrInvalidBackupParams, got %v", err)
	}
}

func TestPath_RejectsTraversal(t *testing.T) {
	cases := []string{"../escape", "../../root", "with/slash", "with space", ""}
	for _, bid := range cases {
		t.Run(bid, func(t *testing.T) {
			_, err := Path("/data", namespace.Root(), "vm", bid, time.Unix(1735000000, 0))
			var e *ErrInvalidBackupParams
			if !errors.As(err, &e) {
				t.Errorf("expected ErrInvalidBackupParams, got %v", err)
			}
		})
	}
}

func TestEnsureDir_CreatesDirs(t *testing.T) {
	tmp := t.TempDir()
	p, err := EnsureDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(tmp, "vm", "100", "2024-12-24T00:26:40Z")
	if p != expected {
		t.Errorf("path: got %q, want %q", p, expected)
	}
	info, err := os.Stat(p)
	if err != nil {
		t.Fatalf("dir not created: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected directory")
	}
}

func TestEnsureDir_Idempotent(t *testing.T) {
	tmp := t.TempDir()
	p1, err := EnsureDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	p2, err := EnsureDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	if p1 != p2 {
		t.Errorf("paths differ across calls: %q vs %q", p1, p2)
	}
}

func TestResolveDir_ExistingSnapshot_ReturnsPath(t *testing.T) {
	tmp := t.TempDir()
	// Pre-create the snapshot dir.
	p, err := EnsureDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	got, err := ResolveDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err != nil {
		t.Fatalf("ResolveDir: %v", err)
	}
	if got != p {
		t.Errorf("path: got %q, want %q", got, p)
	}
}

func TestResolveDir_NonexistentSnapshot_ReturnsError(t *testing.T) {
	tmp := t.TempDir()
	_, err := ResolveDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err == nil {
		t.Error("expected error for nonexistent snapshot, got nil")
	}
}

func TestResolveDir_NonDirectoryPath_ReturnsError(t *testing.T) {
	tmp := t.TempDir()
	// Create a file where the snapshot dir would be.
	p, _ := Path(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	_, err = ResolveDir(tmp, namespace.Root(), "vm", "100", time.Unix(1735000000, 0))
	if err == nil {
		t.Error("expected error for non-directory path, got nil")
	}
}
