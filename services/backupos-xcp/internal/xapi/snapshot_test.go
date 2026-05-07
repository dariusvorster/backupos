package xapi

import (
	"errors"
	"testing"
)

func TestIsAlreadyGone(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"plain error", errors.New("connection refused"), false},
		{"HANDLE_INVALID full XAPI message", errors.New("API Error: HANDLE_INVALID VDI OpaqueRef:abc-123"), true},
		{"HANDLE_INVALID anywhere in string", errors.New("xapi: vdi.destroy: HANDLE_INVALID"), true},
		{"UUID_INVALID full XAPI message", errors.New("API Error: UUID_INVALID VDI 723a75d5-..."), true},
		{"UUID_INVALID anywhere in string", errors.New("xapi: vdi.get_by_uuid: UUID_INVALID"), true},
		{"case sensitive — does NOT match lowercase", errors.New("handle_invalid"), false},
		{"different error code", errors.New("VDI_IN_USE"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAlreadyGone(tt.err)
			if got != tt.want {
				t.Fatalf("isAlreadyGone(%v): got %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
