package xapi

import (
	"context"
	"errors"
	"fmt"
)

// NBDInfo describes one way to reach a snapshot VDI via NBD.
// Returned from XAPI's VDI.get_nbd_info; multiple entries may exist if the
// host has multiple NBD-enabled network interfaces.
type NBDInfo struct {
	ExportName string `json:"export_name"`
	Address    string `json:"address"`
	Port       int    `json:"port"`
	CertPEM    string `json:"cert_pem"`
	Subject    string `json:"subject"`
}

// SnapshotNBDInfo returns NBD connection options for the given snapshot VDI.
// The snapshot must be a regular snapshot (not cbt_metadata) — cbt_metadata
// VDIs cannot be exported over NBD.
//
// Returns an empty slice with no error if the host has no NBD-enabled network
// reachable for this VDI's SR. Caller should treat that as a configuration error.
func (c *Client) SnapshotNBDInfo(ctx context.Context, snapshotUUID string) ([]NBDInfo, error) {
	if snapshotUUID == "" {
		return nil, errors.New("xapi: snapshotUUID required")
	}

	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	ref, err := raw.VDI.GetByUUID(sess, snapshotUUID)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.get_by_uuid(%s): %w", snapshotUUID, err)
	}

	records, err := raw.VDI.GetNbdInfo(sess, ref)
	if err != nil {
		return nil, fmt.Errorf("xapi: vdi.get_nbd_info: %w", err)
	}

	out := make([]NBDInfo, 0, len(records))
	for _, r := range records {
		out = append(out, NBDInfo{
			ExportName: r.Exportname,
			Address:    r.Address,
			Port:       r.Port,
			CertPEM:    r.Cert,
			Subject:    r.Subject,
		})
	}
	return out, nil
}
