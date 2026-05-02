package owner

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPath_Format(t *testing.T) {
	got := Path("/var/lib/backupos/pbs/mystore", "vm", "100")
	want := "/var/lib/backupos/pbs/mystore/vm/100/owner"
	if got != want {
		t.Errorf("Path = %q, want %q", got, want)
	}
}

func TestRead_NonExistent_ReturnsErrNotExist(t *testing.T) {
	root := t.TempDir()
	_, err := Read(root, "vm", "100")
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected os.ErrNotExist, got %v", err)
	}
}

func TestRead_ValidFile_ReturnsUserRealm(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "vm", "100")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("root@pbs\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Read(root, "vm", "100")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root@pbs" {
		t.Errorf("got %q, want %q", got, "root@pbs")
	}
}

func TestRead_TrimsTrailingNewline(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "vm", "200")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("alice@pbs\n\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Read(root, "vm", "200")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "alice@pbs" {
		t.Errorf("got %q, want %q", got, "alice@pbs")
	}
}

func TestRead_NoNewline_AlsoWorks(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "ct", "42")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("root@pam"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Read(root, "ct", "42")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root@pam" {
		t.Errorf("got %q, want %q", got, "root@pam")
	}
}

func TestRead_InvalidFormat_ReturnsErrInvalidOwnerFile(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "vm", "300")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("not-valid-garbage\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Read(root, "vm", "300")
	if !errors.Is(err, ErrInvalidOwnerFile) {
		t.Errorf("expected ErrInvalidOwnerFile, got %v", err)
	}
}

func TestRead_TokenNameInFile_Accepted(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "vm", "400")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("root@pbs!alice\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Read(root, "vm", "400")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "root@pbs!alice" {
		t.Errorf("got %q, want %q", got, "root@pbs!alice")
	}
}

func TestSetIfAbsent_FreshGroup_WritesFile(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "500", "root@pbs"); err != nil {
		t.Fatalf("SetIfAbsent: %v", err)
	}
	got, err := Read(root, "vm", "500")
	if err != nil {
		t.Fatalf("Read after set: %v", err)
	}
	if got != "root@pbs" {
		t.Errorf("owner = %q, want %q", got, "root@pbs")
	}
}

func TestSetIfAbsent_SameOwner_Idempotent(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "600", "root@pbs"); err != nil {
		t.Fatalf("first SetIfAbsent: %v", err)
	}
	if err := SetIfAbsent(root, "vm", "600", "root@pbs"); err != nil {
		t.Errorf("second SetIfAbsent (same owner): %v", err)
	}
}

func TestSetIfAbsent_DifferentOwner_ReturnsErrOwnerMismatch(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "700", "root@pbs"); err != nil {
		t.Fatalf("first SetIfAbsent: %v", err)
	}
	err := SetIfAbsent(root, "vm", "700", "alice@pbs")
	if !errors.Is(err, ErrOwnerMismatch) {
		t.Errorf("expected ErrOwnerMismatch, got %v", err)
	}
}

func TestSetIfAbsent_AtomicWrite_NoOwnerTmpAfterSuccess(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "800", "root@pbs"); err != nil {
		t.Fatalf("SetIfAbsent: %v", err)
	}
	tmpPath := Path(root, "vm", "800") + ".tmp"
	if _, err := os.Stat(tmpPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("owner.tmp should not exist after successful write, got: %v", err)
	}
}

func TestSetIfAbsent_AcceptsTokenInInput(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "900", "root@pbs!alice"); err != nil {
		t.Fatalf("SetIfAbsent with token authid: %v", err)
	}
	got, err := Read(root, "vm", "900")
	if err != nil {
		t.Fatalf("Read after set: %v", err)
	}
	if got != "root@pbs!alice" {
		t.Errorf("owner = %q, want %q", got, "root@pbs!alice")
	}
}

func TestSetIfAbsent_TokenStored_UserCaller_Idempotent(t *testing.T) {
	root := t.TempDir()
	// Pre-create owner as token authid.
	if err := SetIfAbsent(root, "vm", "910", "root@pbs!test1"); err != nil {
		t.Fatalf("first SetIfAbsent: %v", err)
	}
	// Same user's bare authid should match via AuthidMatches (token stored, user calling).
	if err := SetIfAbsent(root, "vm", "910", "root@pbs"); err != nil {
		t.Errorf("SetIfAbsent for user portion of token owner: %v", err)
	}
}

func TestSetIfAbsent_UserStored_TokenCaller_Mismatch(t *testing.T) {
	root := t.TempDir()
	// Pre-create owner as bare user.
	if err := SetIfAbsent(root, "vm", "920", "root@pbs"); err != nil {
		t.Fatalf("first SetIfAbsent: %v", err)
	}
	// Token caller does NOT match bare-user stored owner (asymmetric rule).
	err := SetIfAbsent(root, "vm", "920", "root@pbs!test1")
	if !errors.Is(err, ErrOwnerMismatch) {
		t.Errorf("expected ErrOwnerMismatch for token caller vs user owner, got %v", err)
	}
}

func TestAuthidMatches(t *testing.T) {
	tests := []struct {
		stored string
		caller string
		want   bool
	}{
		{"root@pbs!test1", "root@pbs!test1", true},  // exact token match
		{"root@pbs", "root@pbs", true},               // exact user match
		{"root@pbs!test1", "root@pbs", true},         // token stored, bare user calling
		{"root@pbs", "root@pbs!test1", false},        // user stored, token calling — asymmetric
		{"root@pbs!test1", "root@pbs!other", false},  // different tokens
		{"root@pbs!test1", "alice@pbs", false},       // different user
	}
	for _, tc := range tests {
		if got := AuthidMatches(tc.stored, tc.caller); got != tc.want {
			t.Errorf("AuthidMatches(%q, %q) = %v, want %v", tc.stored, tc.caller, got, tc.want)
		}
	}
}

func TestCheck_OwnerFileMissing_AllowsAccess(t *testing.T) {
	root := t.TempDir()
	// No owner file — V1 backcompat: allow.
	if err := Check(root, "vm", "100", "root@pbs"); err != nil {
		t.Errorf("expected nil for missing owner file (V1 backcompat), got %v", err)
	}
}

func TestCheck_MatchingOwner_Allowed(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "100", "root@pbs"); err != nil {
		t.Fatal(err)
	}
	if err := Check(root, "vm", "100", "root@pbs"); err != nil {
		t.Errorf("expected nil for matching owner, got %v", err)
	}
}

func TestCheck_DifferentOwner_Denied(t *testing.T) {
	root := t.TempDir()
	if err := SetIfAbsent(root, "vm", "100", "root@pbs"); err != nil {
		t.Fatal(err)
	}
	err := Check(root, "vm", "100", "alice@pbs")
	if !errors.Is(err, ErrOwnerMismatch) {
		t.Errorf("expected ErrOwnerMismatch, got %v", err)
	}
}

func TestCheck_InvalidFile_Errors(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "vm", "100")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner"), []byte("garbage-no-at\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	err := Check(root, "vm", "100", "root@pbs")
	if err == nil {
		t.Error("expected error for invalid owner file, got nil")
	}
	if errors.Is(err, ErrOwnerMismatch) {
		t.Error("invalid file should not produce ErrOwnerMismatch — it's ErrInvalidOwnerFile")
	}
}
