// Package gcatime provides the atime-touching primitives used by GC mark phase
// and the atime-update safety probe.
package gcatime

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/unix"
)

// TouchChunk sets the chunk file's atime to NOW. Mtime is preserved.
// Returns nil if the chunk file doesn't exist — sweep phase will handle
// that case. Returns error for other I/O failures.
func TouchChunk(path string) error {
	times := []unix.Timespec{
		{Sec: 0, Nsec: unix.UTIME_NOW},  // atime → NOW
		{Sec: 0, Nsec: unix.UTIME_OMIT}, // mtime → unchanged
	}
	err := unix.UtimesNanoAt(unix.AT_FDCWD, path, times, unix.AT_SYMLINK_NOFOLLOW)
	if err != nil {
		if errors.Is(err, unix.ENOENT) {
			return nil // chunk gone — fine, sweep will not see it either
		}
		return fmt.Errorf("touch chunk atime: %w", err)
	}
	return nil
}

// VerifyAtimeUpdates writes a probe file under <chunkStoreRoot>/.gc-probe,
// sets its atime to a known-old value, then sets it to NOW via UTIME_NOW,
// and confirms after each step that the kernel actually persisted the change.
//
// Returns error if the filesystem doesn't support atime updates (e.g.
// mounted with noatime, network filesystem with disabled atime, etc.).
//
// Aborting GC on the back of this error is essential: running GC sweep on
// a filesystem that doesn't honor atime updates would delete every chunk
// older than the cutoff, including ones still in use.
//
// NOTE: the "filesystem doesn't honor atime" failure path is production-only
// behavior and cannot easily be tested in unit tests since the test
// filesystem will honor atime.
func VerifyAtimeUpdates(chunkStoreRoot string) error {
	probeDir := filepath.Join(chunkStoreRoot, ".gc-probe")
	if err := os.MkdirAll(probeDir, 0o755); err != nil {
		return fmt.Errorf("create probe dir: %w", err)
	}

	probePath := filepath.Join(probeDir, "probe")
	if err := os.WriteFile(probePath, []byte("gc-probe"), 0o644); err != nil {
		return fmt.Errorf("write probe file: %w", err)
	}
	defer os.Remove(probePath)

	// Step 1: set atime to a known old value (1 hour ago) and verify it stuck.
	oldAtime := time.Now().Add(-1 * time.Hour)
	oldTimes := []unix.Timespec{
		{Sec: oldAtime.Unix(), Nsec: 0},
		{Sec: 0, Nsec: unix.UTIME_OMIT},
	}
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, probePath, oldTimes, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return fmt.Errorf("set probe old atime: %w", err)
	}

	var st1 unix.Stat_t
	if err := unix.Stat(probePath, &st1); err != nil {
		return fmt.Errorf("stat probe (after old atime): %w", err)
	}
	if delta := st1.Atim.Sec - oldAtime.Unix(); delta < -2 || delta > 2 {
		return fmt.Errorf("filesystem did not honor atime update: set=%d got=%d (delta=%d)",
			oldAtime.Unix(), st1.Atim.Sec, delta)
	}

	// Step 2: set atime to NOW via UTIME_NOW (the actual GC mark mechanism).
	nowTimes := []unix.Timespec{
		{Sec: 0, Nsec: unix.UTIME_NOW},
		{Sec: 0, Nsec: unix.UTIME_OMIT},
	}
	beforeNow := time.Now().Unix()
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, probePath, nowTimes, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return fmt.Errorf("set probe atime via UTIME_NOW: %w", err)
	}

	var st2 unix.Stat_t
	if err := unix.Stat(probePath, &st2); err != nil {
		return fmt.Errorf("stat probe (after UTIME_NOW): %w", err)
	}
	if st2.Atim.Sec < beforeNow-2 {
		return fmt.Errorf("UTIME_NOW did not update atime: before=%d got=%d", beforeNow, st2.Atim.Sec)
	}
	if st2.Atim.Sec <= st1.Atim.Sec {
		return fmt.Errorf("UTIME_NOW did not advance atime: was %d, now %d", st1.Atim.Sec, st2.Atim.Sec)
	}

	return nil
}
