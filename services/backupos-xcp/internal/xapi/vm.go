package xapi

import (
	"context"
	"errors"
	"fmt"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// CreateVM creates a minimal HVM VM shell and returns its UUID.
// The VM has no VBDs attached — use CreateVBD to attach disks after creation.
func (c *Client) CreateVM(ctx context.Context, nameLabel string, memoryBytes int64, vcpus int) (string, error) {
	if nameLabel == "" {
		return "", errors.New("xapi: nameLabel required")
	}
	if memoryBytes <= 0 {
		memoryBytes = 1 << 30 // 1 GiB default
	}
	if vcpus <= 0 {
		vcpus = 2
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	vmRef, err := raw.VM.Create(sess, xenapi.VMRecord{
		NameLabel:        nameLabel,
		MemoryStaticMax:  int(memoryBytes),
		MemoryStaticMin:  int(memoryBytes / 2),
		MemoryDynamicMax: int(memoryBytes),
		MemoryDynamicMin: int(memoryBytes / 2),
		VCPUsMax:         vcpus,
		VCPUsAtStartup:   vcpus,
		HVMBootPolicy:    "BIOS order",
	})
	if err != nil {
		return "", fmt.Errorf("xapi: vm.create: %w", err)
	}

	uuid, err := raw.VM.GetUUID(sess, vmRef)
	if err != nil {
		return "", fmt.Errorf("xapi: vm.get_uuid after create: %w", err)
	}
	return uuid, nil
}

// CreateVBD attaches a VDI to a VM as a virtual block device and returns the VBD UUID.
func (c *Client) CreateVBD(ctx context.Context, vmUUID, vdiUUID, userDevice string, bootable bool) (string, error) {
	if vmUUID == "" || vdiUUID == "" {
		return "", errors.New("xapi: vmUUID and vdiUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	vmRef, err := raw.VM.GetByUUID(sess, vmUUID)
	if err != nil {
		return "", fmt.Errorf("xapi: vm.get_by_uuid(%s): %w", vmUUID, err)
	}

	vdiRef, err := raw.VDI.GetByUUID(sess, vdiUUID)
	if err != nil {
		return "", fmt.Errorf("xapi: vdi.get_by_uuid(%s): %w", vdiUUID, err)
	}

	vbdRef, err := raw.VBD.Create(sess, xenapi.VBDRecord{
		VM:         vmRef,
		VDI:        vdiRef,
		Userdevice: userDevice,
		Bootable:   bootable,
		Mode:       xenapi.VbdModeRW,
		Type:       xenapi.VbdTypeDisk,
		Empty:      false,
	})
	if err != nil {
		return "", fmt.Errorf("xapi: vbd.create: %w", err)
	}

	uuid, err := raw.VBD.GetUUID(sess, vbdRef)
	if err != nil {
		return "", fmt.Errorf("xapi: vbd.get_uuid after create: %w", err)
	}
	return uuid, nil
}
