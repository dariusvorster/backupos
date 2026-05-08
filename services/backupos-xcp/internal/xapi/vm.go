package xapi

import (
	"context"
	"errors"
	"fmt"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// CloneVMOpts configures a VM clone from template operation.
type CloneVMOpts struct {
	TemplateNameLabel string // resolved to ref via FindTemplateByLabel; defaults to "Other install media"
	NewNameLabel      string
	MemoryBytes       int64 // 0 → keep template default
	Vcpus             int   // 0 → keep template default
}

// CloneVMResult carries the new VM's UUID.
type CloneVMResult struct {
	UUID string
}

// FindTemplateByLabel returns the first VM template ref whose name-label matches.
func (c *Client) FindTemplateByLabel(ctx context.Context, nameLabel string) (xenapi.VMRef, error) {
	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	refs, err := raw.VM.GetAll(sess)
	if err != nil {
		return "", fmt.Errorf("xapi: vm.get_all: %w", err)
	}
	for _, ref := range refs {
		isTemplate, terr := raw.VM.GetIsATemplate(sess, ref)
		if terr != nil || !isTemplate {
			continue
		}
		label, lerr := raw.VM.GetNameLabel(sess, ref)
		if lerr != nil {
			continue
		}
		if label == nameLabel {
			return ref, nil
		}
	}
	return "", fmt.Errorf("xapi: template %q not found", nameLabel)
}

// CloneVMFromTemplate clones a template VM, removes the stub VBDs inherited
// from the template, and optionally overrides memory/vcpus. Returns the new
// VM's UUID. Use this instead of CreateVM — VM.Clone is the correct XAPI
// primitive for creating user VMs; VM.Create is for system templates only.
func (c *Client) CloneVMFromTemplate(ctx context.Context, opts CloneVMOpts) (*CloneVMResult, error) {
	if opts.TemplateNameLabel == "" {
		opts.TemplateNameLabel = "Other install media"
	}
	if opts.NewNameLabel == "" {
		return nil, errors.New("xapi: NewNameLabel required")
	}

	tmplRef, err := c.FindTemplateByLabel(ctx, opts.TemplateNameLabel)
	if err != nil {
		return nil, err
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	vmRef, err := raw.VM.Clone(sess, tmplRef, opts.NewNameLabel)
	if err != nil {
		return nil, fmt.Errorf("xapi: vm.clone: %w", err)
	}

	// Remove template stub VBDs so restored disks can be attached cleanly.
	vbdRefs, _ := raw.VM.GetVBDs(sess, vmRef)
	for _, vbdRef := range vbdRefs {
		vdiRef, verr := raw.VBD.GetVDI(sess, vbdRef)
		if verr == nil && string(vdiRef) != "" && string(vdiRef) != "OpaqueRef:NULL" {
			_ = raw.VDI.Destroy(sess, vdiRef) // template VDIs may be shared; ignore errors
		}
		_ = raw.VBD.Destroy(sess, vbdRef)
	}

	if opts.MemoryBytes > 0 {
		_ = raw.VM.SetMemoryStaticMax(sess, vmRef, int(opts.MemoryBytes))
		_ = raw.VM.SetMemoryDynamicMax(sess, vmRef, int(opts.MemoryBytes))
		_ = raw.VM.SetMemoryDynamicMin(sess, vmRef, int(opts.MemoryBytes/2))
		_ = raw.VM.SetMemoryStaticMin(sess, vmRef, int(opts.MemoryBytes/2))
	}
	if opts.Vcpus > 0 {
		_ = raw.VM.SetVCPUsMax(sess, vmRef, opts.Vcpus)
		_ = raw.VM.SetVCPUsAtStartup(sess, vmRef, opts.Vcpus)
	}

	uuid, err := raw.VM.GetUUID(sess, vmRef)
	if err != nil {
		return nil, fmt.Errorf("xapi: vm.get_uuid after clone: %w", err)
	}
	return &CloneVMResult{UUID: uuid}, nil
}

// DEPRECATED: CreateVM uses VM.Create which XAPI rejects for user VMs.
// Use CloneVMFromTemplate instead.
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
