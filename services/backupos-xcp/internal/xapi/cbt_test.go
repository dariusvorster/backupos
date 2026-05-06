package xapi

import (
	"encoding/base64"
	"reflect"
	"testing"
)

func TestParseBitmap(t *testing.T) {
	tests := []struct {
		name string
		raw  []byte
		want []ChangedRegion
	}{
		{
			name: "empty",
			raw:  []byte{},
			want: nil,
		},
		{
			name: "all zeros, no changes",
			raw:  []byte{0x00, 0x00, 0x00},
			want: nil,
		},
		{
			name: "single bit set, first block",
			raw:  []byte{0x80}, // 1000 0000 — block 0
			want: []ChangedRegion{{Offset: 0, Length: BlockSize}},
		},
		{
			name: "single bit set, last block of first byte",
			raw:  []byte{0x01}, // 0000 0001 — block 7
			want: []ChangedRegion{{Offset: 7 * BlockSize, Length: BlockSize}},
		},
		{
			name: "all 8 bits set, single byte",
			raw:  []byte{0xFF}, // blocks 0..7, coalesced
			want: []ChangedRegion{{Offset: 0, Length: 8 * BlockSize}},
		},
		{
			name: "two non-adjacent regions",
			raw:  []byte{0xC0, 0x03}, // 1100 0000  0000 0011
			// blocks 0,1 and blocks 14,15
			want: []ChangedRegion{
				{Offset: 0, Length: 2 * BlockSize},
				{Offset: 14 * BlockSize, Length: 2 * BlockSize},
			},
		},
		{
			name: "region spans byte boundary",
			raw:  []byte{0x03, 0xC0}, // 0000 0011  1100 0000
			// blocks 6,7,8,9 — coalesced
			want: []ChangedRegion{{Offset: 6 * BlockSize, Length: 4 * BlockSize}},
		},
		{
			name: "alternating bits",
			raw:  []byte{0xAA}, // 1010 1010 = blocks 0, 2, 4, 6
			want: []ChangedRegion{
				{Offset: 0, Length: BlockSize},
				{Offset: 2 * BlockSize, Length: BlockSize},
				{Offset: 4 * BlockSize, Length: BlockSize},
				{Offset: 6 * BlockSize, Length: BlockSize},
			},
		},
		{
			name: "run extends to end of bitmap",
			raw:  []byte{0x0F}, // 0000 1111 = blocks 4,5,6,7
			want: []ChangedRegion{{Offset: 4 * BlockSize, Length: 4 * BlockSize}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b64 := base64.StdEncoding.EncodeToString(tt.raw)
			got, err := ParseBitmap(b64)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("regions mismatch:\n got: %+v\nwant: %+v", got, tt.want)
			}
		})
	}
}

func TestParseBitmap_InvalidBase64(t *testing.T) {
	_, err := ParseBitmap("not!valid!base64!!!")
	if err == nil {
		t.Fatal("expected error on invalid base64, got nil")
	}
}

func TestParseBitmap_Empty(t *testing.T) {
	got, err := ParseBitmap("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil regions, got %+v", got)
	}
}
