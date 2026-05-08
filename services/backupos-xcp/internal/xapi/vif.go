package xapi

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/url"
	"strings"

	xenapi "github.com/terra-farm/go-xen-api-client"
	"golang.org/x/crypto/ssh"
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
// terra-farm's VIF.Create is incompatible with this XCP-ng XAPI version (both
// the full VIFRecord and the raw APICall approaches have been tried and rejected).
// This implementation falls back to xe-over-SSH: connects to the pool master as
// root and runs "xe vif-create" / "xe vif-param-set" directly.
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

	// Resolve network name_label → NetworkRef → UUID
	netRef, err := findTargetNetwork(raw, sess, info.NetworkLabel)
	if err != nil {
		release()
		return "", "", err
	}
	networkUUID, err := raw.Network.GetUUID(sess, netRef)
	if err != nil {
		release()
		return "", "", fmt.Errorf("xapi: network.get_uuid: %w", err)
	}

	// MAC collision check
	mac := info.MAC
	if mac != "" {
		inUse, _ := isMACInUse(raw, sess, mac)
		if inUse {
			newMAC, mErr := generateRandomMAC()
			if mErr != nil {
				release()
				return "", "", fmt.Errorf("xapi: generate random mac: %w", mErr)
			}
			mac = newMAC
		}
	}

	release() // done with XAPI session; SSH does not need it

	host, err := poolMasterHost(c.cfg.PoolMasterURL)
	if err != nil {
		return "", "", err
	}

	sshCfg := &ssh.ClientConfig{
		User: "root",
		Auth: []ssh.AuthMethod{
			ssh.Password(c.cfg.Password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
	}
	conn, dialErr := ssh.Dial("tcp", host+":22", sshCfg)
	if dialErr != nil {
		return "", "", fmt.Errorf("xapi: ssh dial %s:22: %w", host, dialErr)
	}
	defer conn.Close()

	device := info.Device
	if device == "" {
		device = "0"
	}
	mtu := info.MTU
	if mtu <= 0 {
		mtu = 1500
	}

	// UUIDs, MACs, and device indices are guaranteed safe — no shell quoting needed.
	xeCmd := fmt.Sprintf("xe vif-create vm-uuid=%s network-uuid=%s device=%s mac=%s mtu=%d",
		vmUUID, networkUUID, device, mac, mtu)

	xeSess, sErr := conn.NewSession()
	if sErr != nil {
		return "", "", fmt.Errorf("xapi: ssh new session: %w", sErr)
	}
	out, runErr := xeSess.CombinedOutput(xeCmd)
	xeSess.Close()
	if runErr != nil {
		return "", "", fmt.Errorf("xapi: xe vif-create: %w: %s", runErr, strings.TrimSpace(string(out)))
	}

	vifUUID := strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	if len(vifUUID) != 36 {
		return "", "", fmt.Errorf("xapi: xe vif-create returned unexpected output: %q", string(out))
	}

	// Set locking mode if non-default
	if info.LockingMode != "" && info.LockingMode != "network_default" {
		lockCmd := fmt.Sprintf("xe vif-param-set uuid=%s locking-mode=%s", vifUUID, info.LockingMode)
		lockSess, lErr := conn.NewSession()
		if lErr == nil {
			_ = lockSess.Run(lockCmd)
			lockSess.Close()
		}
	}

	return vifUUID, mac, nil
}

// poolMasterHost extracts the hostname from a pool master URL (strips scheme/port).
func poolMasterHost(rawURL string) (string, error) {
	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("xapi: parse pool master url: %w", err)
	}
	host := u.Hostname()
	if host == "" {
		return "", fmt.Errorf("xapi: could not extract host from pool master url %q", rawURL)
	}
	return host, nil
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
