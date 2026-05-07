package xapi

import (
	"context"
	"errors"
	"fmt"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// SRInfo describes a storage repository available on the pool.
type SRInfo struct {
	UUID       string `json:"uuid"`
	NameLabel  string `json:"name_label"`
	Type       string `json:"type"`
	FreeBytes  int64  `json:"free_bytes"`
	TotalBytes int64  `json:"total_bytes"`
}

// FindSRsByPool returns all SRs visible in the current pool session.
func (c *Client) FindSRsByPool(ctx context.Context) ([]SRInfo, error) {
	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	refs, err := raw.SR.GetAll(sess)
	if err != nil {
		return nil, fmt.Errorf("xapi: sr.get_all: %w", err)
	}

	out := make([]SRInfo, 0, len(refs))
	for _, ref := range refs {
		uuid, err := raw.SR.GetUUID(sess, ref)
		if err != nil {
			continue
		}
		name, _ := raw.SR.GetNameLabel(sess, ref)
		srType, _ := raw.SR.GetType(sess, ref)
		physSize, _ := raw.SR.GetPhysicalSize(sess, ref)
		physUtil, _ := raw.SR.GetPhysicalUtilisation(sess, ref)
		out = append(out, SRInfo{
			UUID:       uuid,
			NameLabel:  name,
			Type:       fmt.Sprintf("%v", srType),
			FreeBytes:  int64(physSize) - int64(physUtil),
			TotalBytes: int64(physSize),
		})
	}
	return out, nil
}

// CreateVDI creates a new writable user-type VDI on the given SR and returns its UUID.
func (c *Client) CreateVDI(ctx context.Context, srUUID, nameLabel string, virtualSize int64) (string, error) {
	if srUUID == "" {
		return "", errors.New("xapi: srUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	srRef, err := raw.SR.GetByUUID(sess, srUUID)
	if err != nil {
		return "", fmt.Errorf("xapi: sr.get_by_uuid(%s): %w", srUUID, err)
	}

	vdiRef, err := raw.VDI.Create(sess, xenapi.VDIRecord{
		NameLabel:   nameLabel,
		SR:          srRef,
		VirtualSize: int(virtualSize),
		Type:        xenapi.VdiTypeUser,
		Sharable:    false,
		ReadOnly:    false,
	})
	if err != nil {
		return "", fmt.Errorf("xapi: vdi.create: %w", err)
	}

	uuid, err := raw.VDI.GetUUID(sess, vdiRef)
	if err != nil {
		return "", fmt.Errorf("xapi: vdi.get_uuid after create: %w", err)
	}
	return uuid, nil
}
