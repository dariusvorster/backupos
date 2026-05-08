package xapi

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"

	xenapi "github.com/terra-farm/go-xen-api-client"
)

// VIFInfo is the preserved-and-replayable VIF state captured at backup time
// and recreated at restore time. JSON-serialized into a restic snapshot tag.
type VIFInfo struct {
	Device       string `json:"device"`        // "0", "1", etc.
	NetworkLabel string `json:"network_label"` // exact name_label of the network on source pool
	MAC          string `json:"mac"`           // colon-separated, lowercase hex
	MTU          int    `json:"mtu"`           // octets, typically 1500
	LockingMode  string `json:"locking_mode"`  // network_default | locked | unlocked | disabled
}

// GetVIFsForVM returns the preserved VIF info for each VIF attached to the given VM.
func (c *Client) GetVIFsForVM(ctx context.Context, vmUUID string) ([]VIFInfo, error) {
	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return nil, err
	}
	defer release()

	vmRef, err := raw.VM.GetByUUID(sess, vmUUID)
	if err != nil {
		return nil, fmt.Errorf("xapi: vm.get_by_uuid(%s): %w", vmUUID, err)
	}

	vifRefs, err := raw.VM.GetVIFs(sess, vmRef)
	if err != nil {
		return nil, fmt.Errorf("xapi: vm.get_vifs: %w", err)
	}

	out := make([]VIFInfo, 0, len(vifRefs))
	for _, vifRef := range vifRefs {
		device, _ := raw.VIF.GetDevice(sess, vifRef)
		mac, _ := raw.VIF.GetMAC(sess, vifRef)
		mtuRaw, _ := raw.VIF.GetMTU(sess, vifRef)
		netRef, _ := raw.VIF.GetNetwork(sess, vifRef)
		lockingMode, _ := raw.VIF.GetLockingMode(sess, vifRef)

		var networkLabel string
		if string(netRef) != "" {
			label, lerr := raw.Network.GetNameLabel(sess, netRef)
			if lerr == nil {
				networkLabel = label
			}
		}

		out = append(out, VIFInfo{
			Device:       device,
			NetworkLabel: networkLabel,
			MAC:          mac,
			MTU:          int(mtuRaw),
			LockingMode:  string(lockingMode),
		})
	}
	return out, nil
}

// CreateVIFFromInfo creates a new VIF on the given VM from preserved VIFInfo.
//
// Network lookup fallback chain:
//  1. Exact name_label match on target pool
//  2. First non-internal network (excludes bridge=xenapi)
//  3. Error — caller logs and continues; restore is not aborted
//
// MAC collision: if the requested MAC is in use, generates a new locally-administered
// unicast MAC and returns it as macUsed so the caller can log the substitution.
func (c *Client) CreateVIFFromInfo(ctx context.Context, vmUUID string, info VIFInfo) (uuid string, macUsed string, err error) {
	raw, sess, release, err := c.Session(ctx)
	if err != nil {
		return "", "", err
	}
	defer release()

	vmRef, err := raw.VM.GetByUUID(sess, vmUUID)
	if err != nil {
		return "", "", fmt.Errorf("xapi: vm.get_by_uuid(%s): %w", vmUUID, err)
	}

	netRef, err := findTargetNetwork(raw, sess, info.NetworkLabel)
	if err != nil {
		return "", "", err
	}

	mac := info.MAC
	if mac != "" {
		inUse, _ := isMACInUse(raw, sess, mac)
		if inUse {
			newMAC, mErr := generateRandomMAC()
			if mErr != nil {
				return "", "", fmt.Errorf("xapi: generate random mac: %w", mErr)
			}
			mac = newMAC
		}
	}

	device := info.Device
	if device == "" {
		device = "0"
	}
	mtu := info.MTU
	if mtu <= 0 {
		mtu = 1500
	}

	// XAPI's VIF.create rejects terra-farm's VIFRecord wrapper because it
	// includes runtime/output-only fields. Use only the 11 input fields per XAPI docs.
	argsMap := map[string]interface{}{
		"device":               device,
		"network":              string(netRef),
		"VM":                   string(vmRef),
		"MAC":                  mac,
		"MTU":                  mtu,
		"other_config":         map[string]string{},
		"qos_algorithm_type":   "",
		"qos_algorithm_params": map[string]string{},
		"locking_mode":         "network_default",
		"ipv4_allowed":         []string{},
		"ipv6_allowed":         []string{},
	}
	result, err := raw.APICall("VIF.create", sess, argsMap)
	if err != nil {
		return "", "", fmt.Errorf("xapi: vif.create: %w", err)
	}
	vifRefStr, ok := result.Value.(string)
	if !ok {
		return "", "", fmt.Errorf("xapi: vif.create returned non-string ref: %T", result.Value)
	}
	vifRef := xenapi.VIFRef(vifRefStr)

	if info.LockingMode != "" && info.LockingMode != "network_default" {
		var mode xenapi.VifLockingMode
		switch strings.ToLower(info.LockingMode) {
		case "locked":
			mode = xenapi.VifLockingModeLocked
		case "unlocked":
			mode = xenapi.VifLockingModeUnlocked
		case "disabled":
			mode = xenapi.VifLockingModeDisabled
		default:
			mode = xenapi.VifLockingModeNetworkDefault
		}
		_ = raw.VIF.SetLockingMode(sess, vifRef, mode)
	}

	uuid, err = raw.VIF.GetUUID(sess, vifRef)
	if err != nil {
		return "", "", fmt.Errorf("xapi: vif.get_uuid: %w", err)
	}
	return uuid, mac, nil
}

func findTargetNetwork(raw *xenapi.Client, sess xenapi.SessionRef, label string) (xenapi.NetworkRef, error) {
	netRefs, err := raw.Network.GetAll(sess)
	if err != nil {
		return "", fmt.Errorf("xapi: network.get_all: %w", err)
	}

	type netInfo struct {
		ref    xenapi.NetworkRef
		label  string
		bridge string
	}
	all := make([]netInfo, 0, len(netRefs))
	for _, ref := range netRefs {
		l, _ := raw.Network.GetNameLabel(sess, ref)
		b, _ := raw.Network.GetBridge(sess, ref)
		all = append(all, netInfo{ref: ref, label: l, bridge: b})
	}

	for _, n := range all {
		if n.label == label {
			return n.ref, nil
		}
	}

	for _, n := range all {
		if n.bridge != "xenapi" && !strings.HasPrefix(n.bridge, "host-internal") {
			return n.ref, nil
		}
	}

	return "", fmt.Errorf("xapi: no usable network on target pool (looking for %q, no fallback found)", label)
}

func isMACInUse(raw *xenapi.Client, sess xenapi.SessionRef, mac string) (bool, error) {
	vifRecs, err := raw.VIF.GetAllRecords(sess)
	if err != nil {
		return false, err
	}
	for _, rec := range vifRecs {
		if strings.EqualFold(rec.MAC, mac) {
			return true, nil
		}
	}
	return false, nil
}

// generateRandomMAC returns a locally-administered unicast MAC address.
func generateRandomMAC() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	buf[0] = (buf[0] | 0x02) & 0xFE
	return fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", buf[0], buf[1], buf[2], buf[3], buf[4], buf[5]), nil
}
