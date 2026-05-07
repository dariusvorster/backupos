package xapi

import (
	"context"
	"errors"
	"fmt"
	"strings"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// SnapshotInfo is the result of taking a snapshot.
type SnapshotInfo struct {
	UUID       string `json:"uuid"`
	NameLabel  string `json:"name_label"`
	CbtEnabled bool   `json:"cbt_enabled"`
	SourceUUID string `json:"source_uuid"`
}

// Snapshot creates a read-only snapshot of the given VDI and sets a
// recognisable name label. The snapshot inherits CBT state from its source —
// if the source has CBT enabled, the snapshot does too.
//
// nameLabel is what appears in the XenCenter / xe vdi-list UI. Passing an
// empty string falls back to the XAPI default (typically "<source_label>
// (<timestamp>)").
//
// Returns SnapshotInfo with the new snapshot's UUID, label, and inherited CBT
// state. Caller is responsible for eventually destroying or data_destroying.
func (c *Client) Snapshot(ctx context.Context, sourceVDIUUID, nameLabel string) (*SnapshotInfo, error) {
	if sourceVDIUUID == "" {
		return nil, errors.New("xapi: sourceVDIUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	sourceRef, err := raw.VDI.GetByUUID(sess, sourceVDIUUID)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.get_by_uuid(%s): %w", sourceVDIUUID, err)
	}

	// Empty driver_params is the common case. Specific SR backends accept
	// hints here (e.g. "compress=true" for compressed snapshots), but those
	// are SR-specific and we don't surface them at this layer.
	snapRef, err := raw.VDI.Snapshot(sess, sourceRef, map[string]string{})
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.snapshot: %w", err)
	}

	// Best-effort label set. If it fails, the snapshot is still valid;
	// we signal the failure by returning an empty label so the caller knows.
	if nameLabel != "" {
		if labelErr := raw.VDI.SetNameLabel(sess, snapRef, nameLabel); labelErr != nil {
			nameLabel = ""
		}
	}

	snapUUID, err := raw.VDI.GetUUID(sess, snapRef)
	if err != nil {
		// Snapshot was created but we can't read its UUID. Try to clean up,
		// best-effort. If destroy fails the snapshot is orphaned in the pool.
		_ = raw.VDI.Destroy(sess, snapRef)
		return nil, fmt.Errorf("xapi: vdi.get_uuid(snapshot): %w", err)
	}

	cbtEnabled, err := raw.VDI.GetCbtEnabled(sess, snapRef)
	if err != nil {
		cbtEnabled = false
	}

	return &SnapshotInfo{
		UUID:       snapUUID,
		NameLabel:  nameLabel,
		CbtEnabled: cbtEnabled,
		SourceUUID: sourceVDIUUID,
	}, nil
}

// DestroySnapshot fully removes the snapshot VDI (both data and metadata).
//
// Idempotent: if the snapshot is already gone (HANDLE_INVALID), returns nil.
func (c *Client) DestroySnapshot(ctx context.Context, snapshotUUID string) error {
	if snapshotUUID == "" {
		return errors.New("xapi: snapshotUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return err
	}
	defer release()

	ref, err := raw.VDI.GetByUUID(sess, snapshotUUID)
	if err != nil {
		if isHandleInvalid(err) {
			return nil
		}
		return fmt.Errorf("xapi: vdi.get_by_uuid(%s): %w", snapshotUUID, err)
	}

	if err := raw.VDI.Destroy(sess, ref); err != nil {
		if isHandleInvalid(err) {
			return nil
		}
		return fmt.Errorf("xapi: vdi.destroy(%s): %w", snapshotUUID, err)
	}
	return nil
}

// DataDestroySnapshot deletes the snapshot's data while preserving its CBT
// metadata. After this call, the snapshot's VDI type changes to cbt_metadata
// and it can no longer be read for data, but it can still serve as the
// reference point for a future ChangedRegions comparison.
//
// Idempotent: calling on an already-cbt_metadata VDI is a no-op (XAPI
// guarantees this).
func (c *Client) DataDestroySnapshot(ctx context.Context, snapshotUUID string) error {
	if snapshotUUID == "" {
		return errors.New("xapi: snapshotUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return err
	}
	defer release()

	ref, err := raw.VDI.GetByUUID(sess, snapshotUUID)
	if err != nil {
		if isHandleInvalid(err) {
			return nil
		}
		return fmt.Errorf("xapi: vdi.get_by_uuid(%s): %w", snapshotUUID, err)
	}

	if err := raw.VDI.DataDestroy(sess, ref); err != nil {
		if isHandleInvalid(err) {
			return nil
		}
		return fmt.Errorf("xapi: vdi.data_destroy(%s): %w", snapshotUUID, err)
	}
	return nil
}

// isHandleInvalid checks whether an XAPI error means the VDI is already gone.
// XAPI returns errors as strings like:
//
//	"API Error: HANDLE_INVALID VDI OpaqueRef:..."
//
// We match on the HANDLE_INVALID token to avoid coupling to the exact format.
func isHandleInvalid(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "HANDLE_INVALID")
}

// Compile-time assertion that VDIRef remains a string-alias.
// Mirrors the assertion in cbt.go.
var _ = func() any {
	var ref xenapi.VDIRef
	_ = string(ref)
	return nil
}()
