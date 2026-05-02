package dslock

import (
	"testing"
)

func TestAcquireExclusive_HappyPath(t *testing.T) {
	tmp := t.TempDir()
	l, err := AcquireExclusive(tmp)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if err := l.Release(); err != nil {
		t.Errorf("Release: %v", err)
	}
}

func TestAcquireExclusive_SecondAcquireWhileHeld_ReturnsErrGCBusy(t *testing.T) {
	tmp := t.TempDir()
	l1, err := AcquireExclusive(tmp)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	defer l1.Release()

	_, err = AcquireExclusive(tmp)
	if err == nil {
		t.Fatal("expected ErrGCBusy, got nil")
	}
	if err != ErrGCBusy {
		t.Errorf("expected ErrGCBusy, got: %v", err)
	}
}

func TestAcquireExclusive_AfterRelease_Succeeds(t *testing.T) {
	tmp := t.TempDir()
	l1, err := AcquireExclusive(tmp)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	if err := l1.Release(); err != nil {
		t.Fatalf("Release: %v", err)
	}

	l2, err := AcquireExclusive(tmp)
	if err != nil {
		t.Fatalf("second acquire after release: %v", err)
	}
	_ = l2.Release()
}

func TestRelease_IsIdempotent(t *testing.T) {
	tmp := t.TempDir()
	l, err := AcquireExclusive(tmp)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	if err := l.Release(); err != nil {
		t.Errorf("first Release: %v", err)
	}
	if err := l.Release(); err != nil {
		t.Errorf("second Release (idempotent): %v", err)
	}
}
