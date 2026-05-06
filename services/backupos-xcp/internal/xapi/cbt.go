package xapi

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// BlockSize is the CBT block size in bytes. Per XenServer, CBT tracks
// changes at 64 KiB granularity.
const BlockSize int64 = 64 * 1024

// ChangedRegion describes a contiguous run of changed blocks in a VDI,
// expressed as a byte offset and byte length. Offset is always a multiple
// of BlockSize. Length is always a multiple of BlockSize.
type ChangedRegion struct {
	Offset int64 `json:"offset"`
	Length int64 `json:"length"`
}

// ChangedRegions retrieves the CBT bitmap between two snapshot VDIs and
// returns the changed regions as (offset, length) tuples.
func (c *Client) ChangedRegions(ctx context.Context, vdiFromUUID, vdiToUUID string) ([]ChangedRegion, error) {
	if vdiFromUUID == "" || vdiToUUID == "" {
		return nil, errors.New("xapi: vdiFromUUID and vdiToUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	fromRef, err := raw.VDI.GetByUUID(sess, vdiFromUUID)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.get_by_uuid(from=%s): %w", vdiFromUUID, err)
	}
	toRef, err := raw.VDI.GetByUUID(sess, vdiToUUID)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.get_by_uuid(to=%s): %w", vdiToUUID, err)
	}

	bitmapB64, err := raw.VDI.ListChangedBlocks(sess, fromRef, toRef)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.list_changed_blocks: %w", err)
	}

	return ParseBitmap(bitmapB64)
}

// ParseBitmap decodes a base64-encoded CBT bitmap and returns the changed
// regions as (offset, length) tuples in bytes. Each set bit represents one
// 64 KiB block. Adjacent set bits are coalesced into single regions.
//
// Bit ordering within each byte: most-significant bit first. Bit N (where
// N is the global block index) lives in byte N/8 at bit position 7-(N%8).
//
// An empty input returns nil (no error).
func ParseBitmap(b64 string) ([]ChangedRegion, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("xapi: parse bitmap: base64 decode: %w", err)
	}

	var regions []ChangedRegion
	var (
		runStart int64 = -1
		blockIdx int64
	)

	for byteIdx, b := range raw {
		for bitInByte := 7; bitInByte >= 0; bitInByte-- {
			blockIdx = int64(byteIdx)*8 + int64(7-bitInByte)
			isSet := (b>>uint(bitInByte))&1 == 1
			if isSet {
				if runStart == -1 {
					runStart = blockIdx
				}
			} else {
				if runStart != -1 {
					regions = append(regions, ChangedRegion{
						Offset: runStart * BlockSize,
						Length: (blockIdx - runStart) * BlockSize,
					})
					runStart = -1
				}
			}
		}
	}

	if runStart != -1 {
		endBlock := int64(len(raw)) * 8
		regions = append(regions, ChangedRegion{
			Offset: runStart * BlockSize,
			Length: (endBlock - runStart) * BlockSize,
		})
	}

	return regions, nil
}

// Compile-time assertion that VDIRef is a string alias.
var _ = func() any {
	var ref xenapi.VDIRef
	_ = string(ref)
	return nil
}()
