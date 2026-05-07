package xapi

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// PoolCredentials describes how to reach an XCP-ng pool for one inventory call.
type PoolCredentials struct {
	PoolMasterURL         string
	Username              string
	Password              string
	CertFingerprintSHA256 string
}

// InventoryDisk is one VDI attached to a VM.
type InventoryDisk struct {
	UUID        string `json:"uuid"`
	NameLabel   string `json:"name_label"`
	VirtualSize int64  `json:"virtual_size"`
	Type        string `json:"type"`
	CBTEnabled  bool   `json:"cbt_enabled"`
	UserDevice  string `json:"user_device"`
	Bootable    bool   `json:"bootable"`
}

// InventoryVM is one VM with its disks.
type InventoryVM struct {
	UUID            string          `json:"uuid"`
	NameLabel       string          `json:"name_label"`
	PowerState      string          `json:"power_state"`
	IsTemplate      bool            `json:"is_template"`
	IsControlDomain bool            `json:"is_control_domain"`
	Disks           []InventoryDisk `json:"disks"`
}

// InventoryResult is the full inventory of one pool.
type InventoryResult struct {
	PoolUUID  string        `json:"pool_uuid"`
	PoolName  string        `json:"pool_name"`
	HostCount int           `json:"host_count"`
	VMs       []InventoryVM `json:"vms"`
}

// InventoryPool opens a short-lived XAPI session against the given pool and
// returns its VMs with their attached VDIs. Closes the session on return.
//
// Uses scalar getters throughout to avoid the stale-enum issue with GetRecord
// (XCP-ng 8.3 returns allowed_operations values unknown to the 2021-era library).
func InventoryPool(ctx context.Context, creds PoolCredentials) (*InventoryResult, error) {
	if creds.PoolMasterURL == "" || creds.Username == "" || creds.Password == "" {
		return nil, errors.New("xapi: pool URL, username, and password required")
	}

	transport, err := buildInventoryTransport(creds.CertFingerprintSHA256)
	if err != nil {
		return nil, fmt.Errorf("xapi: build transport: %w", err)
	}

	rawURL, err := normalizeXMLRPCURL(creds.PoolMasterURL)
	if err != nil {
		return nil, fmt.Errorf("xapi: parse pool master url: %w", err)
	}

	raw, err := xenapi.NewClient(rawURL, transport)
	if err != nil {
		return nil, fmt.Errorf("xapi: NewClient: %w", err)
	}

	sess, err := raw.Session.LoginWithPassword(creds.Username, creds.Password, "1.0", "backupos-xcp/inventory")
	if err != nil {
		return nil, fmt.Errorf("xapi: login: %w", err)
	}
	defer raw.Session.Logout(sess) //nolint:errcheck

	// Pool info — use scalar getters, not GetRecord (stale-enum risk).
	poolRefs, err := raw.Pool.GetAll(sess)
	if err != nil {
		return nil, fmt.Errorf("xapi: pool.get_all: %w", err)
	}
	if len(poolRefs) == 0 {
		return nil, errors.New("xapi: no pools found at this URL")
	}
	poolUUID, err := raw.Pool.GetUUID(sess, poolRefs[0])
	if err != nil {
		return nil, fmt.Errorf("xapi: pool.get_uuid: %w", err)
	}
	poolName, err := raw.Pool.GetNameLabel(sess, poolRefs[0])
	if err != nil {
		return nil, fmt.Errorf("xapi: pool.get_name_label: %w", err)
	}

	hostRefs, err := raw.Host.GetAll(sess)
	if err != nil {
		return nil, fmt.Errorf("xapi: host.get_all: %w", err)
	}

	vmRefs, err := raw.VM.GetAll(sess)
	if err != nil {
		return nil, fmt.Errorf("xapi: vm.get_all: %w", err)
	}

	out := &InventoryResult{
		PoolUUID:  poolUUID,
		PoolName:  poolName,
		HostCount: len(hostRefs),
		VMs:       make([]InventoryVM, 0, len(vmRefs)),
	}

	for _, vmRef := range vmRefs {
		vmUUID, err := raw.VM.GetUUID(sess, vmRef)
		if err != nil {
			continue
		}
		vmName, err := raw.VM.GetNameLabel(sess, vmRef)
		if err != nil {
			continue
		}
		powerState, err := raw.VM.GetPowerState(sess, vmRef)
		if err != nil {
			continue
		}
		isTemplate, err := raw.VM.GetIsATemplate(sess, vmRef)
		if err != nil {
			continue
		}
		isControlDomain, err := raw.VM.GetIsControlDomain(sess, vmRef)
		if err != nil {
			continue
		}
		vbdRefs, err := raw.VM.GetVBDs(sess, vmRef)
		if err != nil {
			continue
		}

		disks := make([]InventoryDisk, 0)
		for _, vbdRef := range vbdRefs {
			vbdType, err := raw.VBD.GetType(sess, vbdRef)
			if err != nil {
				continue
			}
			if vbdType != xenapi.VbdTypeDisk {
				continue
			}
			vdiRef, err := raw.VBD.GetVDI(sess, vbdRef)
			if err != nil {
				continue
			}
			if string(vdiRef) == "OpaqueRef:NULL" || string(vdiRef) == "" {
				continue
			}
			userDevice, err := raw.VBD.GetUserDevice(sess, vbdRef)
			if err != nil {
				continue
			}
			bootable, err := raw.VBD.GetBootable(sess, vbdRef)
			if err != nil {
				continue
			}

			vdiUUID, err := raw.VDI.GetUUID(sess, vdiRef)
			if err != nil {
				continue
			}
			vdiName, err := raw.VDI.GetNameLabel(sess, vdiRef)
			if err != nil {
				continue
			}
			vdiVirtualSize, err := raw.VDI.GetVirtualSize(sess, vdiRef)
			if err != nil {
				continue
			}
			vdiType, err := raw.VDI.GetType(sess, vdiRef)
			if err != nil {
				continue
			}
			cbtEnabled, err := raw.VDI.GetCbtEnabled(sess, vdiRef)
			if err != nil {
				cbtEnabled = false
			}

			disks = append(disks, InventoryDisk{
				UUID:        vdiUUID,
				NameLabel:   vdiName,
				VirtualSize: int64(vdiVirtualSize),
				Type:        string(vdiType),
				CBTEnabled:  cbtEnabled,
				UserDevice:  userDevice,
				Bootable:    bootable,
			})
		}

		out.VMs = append(out.VMs, InventoryVM{
			UUID:            vmUUID,
			NameLabel:       vmName,
			PowerState:      string(powerState),
			IsTemplate:      isTemplate,
			IsControlDomain: isControlDomain,
			Disks:           disks,
		})
	}

	return out, nil
}

// buildInventoryTransport builds an *http.Transport for a short-lived
// inventory session. Mirrors Client.buildTransport using the shared
// normalizeFingerprint helper from client.go.
func buildInventoryTransport(fingerprintHex string) (*http.Transport, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}

	switch {
	case fingerprintHex == "":
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	default:
		expected, err := normalizeFingerprint(fingerprintHex)
		if err != nil {
			return nil, err
		}
		tlsCfg.InsecureSkipVerify = true // manual check below
		tlsCfg.VerifyPeerCertificate = func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
			for _, raw := range rawCerts {
				cert, parseErr := x509.ParseCertificate(raw)
				if parseErr != nil {
					continue
				}
				got := sha256.Sum256(cert.Raw)
				if hex.EncodeToString(got[:]) == expected {
					return nil
				}
			}
			return fmt.Errorf("xapi: cert fingerprint mismatch (expected %s)", fingerprintHex)
		}
	}

	return &http.Transport{
		TLSClientConfig:       tlsCfg,
		ResponseHeaderTimeout: 30 * time.Second,
	}, nil
}

// normalizeXMLRPCURL ensures the URL has an https:// scheme and "/" path.
// Mirrors the logic in Client.xmlrpcURL.
func normalizeXMLRPCURL(raw string) (string, error) {
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" {
		u.Scheme = "https"
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/"
	}
	return u.String(), nil
}
