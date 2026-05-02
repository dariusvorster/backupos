//go:build !linux

package chunkstore

import (
	"os"
	"time"

	"golang.org/x/sys/unix"
)

func atimeFromFileInfo(path string, _ os.FileInfo) time.Time {
	var st unix.Stat_t
	if err := unix.Stat(path, &st); err != nil {
		return time.Time{}
	}
	return time.Unix(st.Atimespec.Sec, st.Atimespec.Nsec)
}

// AtimeFromPath reads the access time of path from the filesystem.
// Returns the zero time on error.
func AtimeFromPath(path string) time.Time {
	var st unix.Stat_t
	if err := unix.Stat(path, &st); err != nil {
		return time.Time{}
	}
	return time.Unix(st.Atimespec.Sec, st.Atimespec.Nsec)
}
