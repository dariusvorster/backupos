# PBS Client Wire-Compatibility Smoke Test

## 1. Purpose

This runbook proves wire-level compatibility between backupos-pbs and the official `proxmox-backup-client`. It is run on every V1 release candidate and after any change touching the PBS protocol surface (auth, index, chunk, restore, GC). The goal is to demonstrate that an unmodified Proxmox client backs up to backupos-pbs and restores byte-equivalent data, with results matching those of a real Proxmox Backup Server used as a control.

---

## 2. Topology

- **BackupOS server**: `192.168.69.52:3093` (LAN), `100.66.28.69:3093` (Tailscale). System under test.
- **Real PBS LXC**: `192.168.69.21:8007`. Control reference.
- **Proxmox02**: `192.168.69.4`. Hypervisor that hosts the smoke-test LXC.
- **Smoke-test LXC**: `CT299`, VLAN 99 (HomeLab Test), Debian 13 (Trixie). Runs `proxmox-backup-client`.
- **Operator workstation**: any host with SSH access to all of the above (Tailscale-reachable from a cruise ship is acceptable).

---

## 3. One-time setup

### 3a. Provision smoke-test LXC (CT299)

On Proxmox02 (SSH or web shell), run:

```bash
# Download Debian 13 template if not already present
pveam update
pveam available | grep debian-13
pveam download local debian-13-standard_13.0-1_amd64.tar.zst

# Create CT299 on VLAN 99
pct create 299 local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
  --hostname pbs-smoke \
  --cores 2 \
  --memory 1024 \
  --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,tag=99,ip=dhcp \
  --unprivileged 1 \
  --features nesting=0 \
  --onboot 0 \
  --start 1

# Wait ~10s for first boot, then enter
pct exec 299 -- bash -c 'apt update && apt install -y curl ca-certificates openssh-server sudo'

# Set root password for SSH access
pct exec 299 -- bash -c 'echo "root:smoketest" | chpasswd'
pct exec 299 -- bash -c 'sed -i "s/^#PermitRootLogin.*/PermitRootLogin yes/" /etc/ssh/sshd_config'
pct exec 299 -- bash -c 'systemctl restart ssh'

# Note the IP (will be on VLAN 99 DHCP range)
pct exec 299 -- ip -4 addr show eth0 | grep inet
```

Note the CT299 IP address — used everywhere below as `$SMOKE_IP`.

`--features nesting=0` and `--unprivileged 1` are correct for this LXC. Do not enable nesting; we do not need Docker inside.

### 3b. Install `proxmox-backup-client` in CT299

SSH into CT299 (`ssh root@$SMOKE_IP`, password `smoketest`) and run:

```bash
# Add Proxmox archive keyring (no subscription required)
wget https://enterprise.proxmox.com/debian/proxmox-archive-keyring-trixie.gpg \
  -O /usr/share/keyrings/proxmox-archive-keyring.gpg
chmod 644 /usr/share/keyrings/proxmox-archive-keyring.gpg

# Add the pbs-client repo (free, no subscription)
cat > /etc/apt/sources.list.d/pbs-client.sources <<'EOF'
Types: deb
URIs: http://download.proxmox.com/debian/pbs-client
Suites: trixie
Components: main
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF

apt update
apt install -y proxmox-backup-client jq

# Verify version
proxmox-backup-client --version
```

This is the official Proxmox client from the official Proxmox APT repo. No subscription is required for the `pbs-client` repo. We are NOT building from source, NOT using a static binary, and NOT modifying the client.

### 3c. Create matching API tokens on both servers

**On the BackupOS server — via the web UI:**

BackupOS manages tokens through the web application. Navigate to the BackupOS web UI (e.g. `https://192.168.69.52` or your Tailscale address), sign in as an admin, then go to **PBS → Tokens** (path: `/pbs/tokens`).

Create a token with:

| Field | Value |
|-------|-------|
| User | `smoke` |
| Realm | `pbs` |
| Token name | `smoke1` |
| Permissions | `read+write` |

The UI returns the plaintext secret once on creation — capture it immediately as `$SMOKE_TOKEN_BACKUPOS`. It is not shown again.

The resulting auth-id is `smoke@pbs!smoke1`.

**On the real PBS LXC at 192.168.69.21:**

```bash
# SSH into PBS LXC
ssh root@192.168.69.21

# Create user (if not exists)
proxmox-backup-manager user create smoke@pbs --password "$(openssl rand -hex 16)"

# Create token
proxmox-backup-manager user generate-token smoke@pbs smoke1
# Capture the "value" field from the JSON output — that's the secret

# Grant permissions on the test datastore
# (assumes a datastore named 'default' exists; if not, create one:
#   proxmox-backup-manager datastore create default /var/lib/proxmox-backup/default
# or adjust $CONTROL_DATASTORE in the env block to match what exists)
proxmox-backup-manager acl update /datastore/default DatastoreAdmin \
  --auth-id 'smoke@pbs!smoke1'
```

Capture the secret as `$SMOKE_TOKEN_REAL_PBS`.

### 3d. Capture server fingerprints

```bash
# On the BackupOS server terminal
openssl x509 -in /var/lib/backupos/pbs/cert.pem -fingerprint -sha256 -noout \
  | awk -F'=' '{print $2}'
# → paste result as $FP_BACKUPOS

# On real PBS LXC
ssh root@192.168.69.21 \
  'proxmox-backup-manager cert info | grep -i fingerprint | head -1 | awk "{print \$NF}"'
# → paste result as $FP_REAL_PBS
```

---

## 4. Smoke-test environment block

Paste this into CT299's shell before running the script:

```bash
# Server endpoints
export BACKUPOS_HOST='192.168.69.52:3093'
export BACKUPOS_DATASTORE='default'
export REAL_PBS_HOST='192.168.69.21:8007'
export CONTROL_DATASTORE='default'   # adjust if real PBS has a different datastore name

# Auth (paste the secrets captured in step 3c)
export SMOKE_TOKEN_BACKUPOS='SECRET_FROM_3c'
export SMOKE_TOKEN_REAL_PBS='SECRET_FROM_3c'
export PBS_AUTH_ID='smoke@pbs!smoke1'

# Fingerprints (captured in step 3d)
export FP_BACKUPOS='AB:CD:EF:...'
export FP_REAL_PBS='12:34:56:...'

# Output dir (created by the script)
export SMOKE_OUT="$HOME/smoke-pbs-$(date -u +%Y%m%dT%H%M%SZ)"
```

---

## 5. The MVP three-step loop

Run `scripts/smoke/pbs-client-smoke.sh` from CT299 after setting the env block above.

Each step runs against backupos-pbs first, then against the real PBS control. The script writes all output to `$SMOKE_OUT`.

- **Step 1 — status (auth probe):** `proxmox-backup-client status` against both servers using the smoke token. Proves the version handshake, API token auth, and ticket issuance work. Failure here means the wire-level auth path is broken. (We use `status` rather than the interactive `login` subcommand; it exercises the same auth path.)

- **Step 2 — backup `.pxar` (didx):** the script writes a deterministic fixture tree to `/tmp/smoke-pxar-src` (text files, binary blobs, a symlink) and backs that up as a `.pxar` archive against both servers. A live `/etc` was rejected because system-managed files (`ld.so.cache`, `machine-id`, `.pwd.lock`, `/etc/adjtime`) change between backup and restore and produce false-positive content mismatches. Proves the dynamic-index path: chunk upload, blob storage, manifest write, snapshot creation. Failure here means the didx path (PR #274) is broken.

- **Step 3 — backup `.img` (fidx):** create a 64 MiB test image with `dd if=/dev/urandom`, back it up against both servers. Proves the fixed-index path (PR #273). Failure here means VM-style backups don't work.

- **Step 4 — list:** `proxmox-backup-client snapshot list` against both servers. Proves snapshot enumeration and namespace routing.

- **Step 5 — restore + byte-compare:** restore both archives from both servers to a clean directory, then `sha256sum`-compare against originals. Proves index read, chunk fetch, and reassembly. Byte-equivalence is the success criterion.

**Interpreting diff output:** The script normalises outputs before diffing. Expected divergences (allowlisted, not failures):
- ISO timestamps and Unix epoch values
- Snapshot IDs (the UTC-suffix part of `host/<id>/<timestamp>`)
- Server version strings (`proxmox-backup-server x.y.z` vs `backupos-pbs x.y.z`)
- `"uptime"`, `"time"`, `"server-time"` JSON fields

Any other difference in the diff output is unexpected and must be investigated before marking the step passed.

---

## 6. Full matrix (post-MVP)

Deferred until the MVP loop is green. Commands come in a follow-up PR.

- **Incremental dedup**: second backup of unchanged source completes faster and reuses chunks (`reuse-csum` path)
- **Namespaced backups**: backup into `alice/dev` namespace and restore from same; verify root-namespace backup is not visible from the namespaced view
- **Token scope enforcement**: backup with `smoke@pbs!smoke1` then attempt to delete with a different token's auth-id; expect 403
- **Concurrent backups**: two `proxmox-backup-client backup` invocations against different groups simultaneously; both must succeed, no chunk corruption
- **Server-restart-mid-backup**: kill backupos-pbs during a 1 GiB backup, restart, verify session reaper cleans up the partial session within 1 hour, and a fresh backup succeeds
- **GC after deletion**: `snapshot forget` then trigger GC; verify orphan chunks are freed and live chunks are intact (sha256sum-stable)
- **Speedtest**: `proxmox-backup-client benchmark` runs to completion against backupos-pbs
- **Fingerprint mismatch**: backup with wrong `--fingerprint`; expect cert verification failure with no data sent

---

## 7. Pass/fail recording

Post results as a checklist comment on issue #237:

```
## PBS client smoke test — <YYYY-MM-DD>

Commit under test: <git sha>
Backupos-pbs version: <version>
Real PBS version (control): <version>
proxmox-backup-client version: <version>

MVP loop:
- [ ] Step 1: login (backupos)
- [ ] Step 1: login (real PBS, control)
- [ ] Step 2: backup .pxar (backupos)
- [ ] Step 2: backup .pxar (real PBS, control)
- [ ] Step 3: backup .img (backupos)
- [ ] Step 3: backup .img (real PBS, control)
- [ ] Step 4: snapshot list matches expected (backupos)
- [ ] Step 4: snapshot list matches expected (real PBS)
- [ ] Step 5: restore .pxar byte-matches (backupos)
- [ ] Step 5: restore .pxar byte-matches (real PBS)
- [ ] Step 5: restore .img byte-matches (backupos)
- [ ] Step 5: restore .img byte-matches (real PBS)

Diff between backupos and real PBS outputs:
<paste relevant diff sections, or "no unexpected differences">

Notes:
<any anomalies, timing observations, follow-ups>
```

---

## 8. Teardown

CT299 is preserved between runs. To wipe state between runs, delete `$SMOKE_OUT` and remove snapshots:

```bash
proxmox-backup-client snapshot forget host/pbs-smoke-pxar/<timestamp> \
  --repository "$PBS_AUTH_ID@$BACKUPOS_HOST:$BACKUPOS_DATASTORE"

proxmox-backup-client snapshot forget host/pbs-smoke-img/<timestamp> \
  --repository "$PBS_AUTH_ID@$BACKUPOS_HOST:$BACKUPOS_DATASTORE"
```

To destroy CT299 entirely (only when the smoke runbook itself is being rewritten):

```bash
pct stop 299 && pct destroy 299
```
