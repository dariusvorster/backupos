# BackupOS Security Model

This document describes how BackupOS handles secrets at rest, what the
encryption key protects, who can read what, and how to rotate the key.

It does **not** describe transport security (TLS) or authentication
(better-auth) — those are documented elsewhere.

## What is encrypted

BackupOS uses AES-256-GCM for field-level encryption with a single
server-wide encryption key. The following fields are stored encrypted in
the SQLite database:

| Table             | Field             | What it holds                                      |
| ----------------- | ----------------- | -------------------------------------------------- |
| `repositories`    | `config`          | Backend credentials (S3/B2/Azure keys, NFS opts)   |
| `repositories`    | `restic_password` | The Restic repository password                     |
| `repositories`    | `escrowed_key`    | Optional escrowed copy of the Restic key           |
| `smtp_config`     | `password`        | SMTP relay password                                 |
| `alert_channels`  | `config` (parts)  | Per-channel webhook URLs and tokens (see below)    |
| `verification`    | targets `sshKey`  | Inline-encrypted SSH key inside target JSON         |

Encrypted values use the prefix `enc:v1:` followed by base64url-encoded
ciphertext. Plaintext rows from before encryption was introduced are
recognized by the absence of this prefix and migrated lazily on next
write or by a one-time pass at server startup.

### Alert channel field encryption

`alert_channels.config` is a JSON column. Only sensitive fields inside
that JSON are encrypted, not the whole blob — this keeps non-sensitive
metadata (Zulip server URL, stream name, ntfy topic) readable for use
in the channel-list UI subtitle.

| Channel type | Encrypted fields              |
| ------------ | ----------------------------- |
| `discord`    | `url`                         |
| `slack`      | `url`                         |
| `webhook`    | `url`                         |
| `zulip`      | `apiKey`                      |
| `telegram`   | `botToken`                    |
| `pagerduty`  | `integrationKey`              |
| `ntfy`       | `auth`                        |
| `gotify`     | `appToken`                    |
| `pushover`   | `apiToken`, `userKey`         |

Discord/Slack/generic webhook URLs encrypt the entire URL because the
secret is embedded in the path (e.g. Discord webhook tokens).

## What is NOT encrypted

- **API token hashes** (`api_tokens.token_hash`, `integration_tokens.token_hash`)
  are SHA-256 hashes, not encrypted plaintext. They cannot be reversed,
  so encrypting them adds no value.
- Schedules, file paths, hostnames, job names, and other operational
  metadata are stored plaintext.
- Backup data itself — Restic handles that. BackupOS never sees the
  unencrypted contents of a backup.

## The encryption key

The key is a 32-byte (64-hex-char) value loaded at server startup. It
is required for the server to start; without it, encrypted fields cannot
be decrypted and most operations will fail.

### Sources

The key is loaded from one of two sources, in priority order:

1. **`ENCRYPTION_KEY_FILE`** — path to a file containing the hex key.
   Recommended for systemd-managed deployments using
   [`LoadCredential=`][systemd-creds] to expose the key at
   `/run/credentials/<service>/encryption-key` with strict permissions.

2. **`ENCRYPTION_KEY`** — the hex key directly in an env var.

Both sources are validated to contain at least 64 hex chars. Trailing
whitespace is trimmed so `echo "$KEY" > /path/to/file` works.

[systemd-creds]: https://www.freedesktop.org/software/systemd/man/systemd-creds.html

### Default install

The `server-install.sh` script generates a random key on first install
and writes it to `/etc/backupos/server.env` as `ENCRYPTION_KEY=...`. The
file is created with `chmod 600` and owned by the `backupos` user.

## Threat model

### What the key protects against

- **DB exfiltration without server access.** An attacker with read-only
  SQLite access (e.g. via a stolen backup of the BackupOS DB itself, an
  IDOR bug exposing the file, etc.) cannot decrypt secrets without also
  having the key.

### What the key does NOT protect against

- **Root access on the BackupOS server.** Root can read both
  `/etc/backupos/server.env` and the SQLite DB. Encryption is meaningless
  in this scenario; the threat model assumes root is trusted.
- **Access as the `backupos` user.** Same as above — the user that runs
  the service can read both. The mitigation here is to keep that user
  shell-locked (`/usr/sbin/nologin`) and ensure the systemd unit is the
  only thing that runs as it.
- **Memory dump of the running process.** The key is in process memory
  while the server runs. If an attacker can read process memory, they
  have the key. No software-only mitigation exists.

### V1 mitigations in place

- `/etc/backupos/server.env` is created mode 600, owner `backupos`.
- The `backupos` systemd unit drops privileges via `User=backupos`.
- The `backupos` user has no shell.
- `LoadCredential=` is supported (use `ENCRYPTION_KEY_FILE`) for
  installations that prefer systemd-managed credentials.

### Out of scope for V1 (enterprise-tier)

- HSM-backed key storage
- HashiCorp Vault / AWS KMS / GCP KMS integration
- Per-tenant or per-repository keys
- Hardware token unlock at boot

## Operational guide

### Where the key lives

```bash
# Default install
/etc/backupos/server.env       # contains ENCRYPTION_KEY=<hex>

# Systemd LoadCredential= setup
/etc/backupos/encryption.key   # the file referenced by ENCRYPTION_KEY_FILE
```

### Backing up the key

**Critical:** back up the encryption key separately from the BackupOS
database. If the key is lost, encrypted fields become permanently
unrecoverable. A common pattern:

```bash
# Print the key for safekeeping (e.g. password manager, sealed envelope)
sudo cat /etc/backupos/server.env | grep ENCRYPTION_KEY
```

Or, for `LoadCredential=` deployments:

```bash
sudo cat /etc/backupos/encryption.key
```

### Switching from env var to file path

```bash
# 1. Extract the existing key
sudo grep '^ENCRYPTION_KEY=' /etc/backupos/server.env | cut -d= -f2 \
  | sudo tee /etc/backupos/encryption.key
sudo chown backupos:backupos /etc/backupos/encryption.key
sudo chmod 600 /etc/backupos/encryption.key

# 2. Replace ENCRYPTION_KEY with ENCRYPTION_KEY_FILE in the env
sudo sed -i \
  '/^ENCRYPTION_KEY=/c\ENCRYPTION_KEY_FILE=/etc/backupos/encryption.key' \
  /etc/backupos/server.env

# 3. Restart
sudo systemctl restart backupos backupos-pbs
```

### Rotating the key — UI (recommended)

Available at `/settings/security` → "Rotate encryption key". The button:

1. Generates a new random 32-byte key.
2. Re-encrypts every stored secret in a single SQLite transaction.
3. Writes the new key to `/etc/backupos/server.env` (backing up the old
   file as `server.env.pre-rotation-<timestamp>`).
4. Triggers the service to exit so systemd restarts it with the new key.

Total downtime is ~1–2 seconds. The button is disabled when
`ENCRYPTION_KEY_FILE` is set (use the CLI in that case — see below).

**Save the new key from the env file backup or the running env file
before the next rotation.** If the env file is lost, encrypted data is
unrecoverable.

### Rotating the key — CLI (headless servers, recovery)

```bash
sudo systemctl stop backupos backupos-pbs
cd /opt/backupos
sudo -u backupos tsx apps/web/scripts/rotate-key.ts
sudo systemctl start backupos backupos-pbs
```

The CLI uses the same rotation engine as the UI. It supports both
`ENCRYPTION_KEY` and `ENCRYPTION_KEY_FILE` deployments — the new key is
written to whichever source the env file declares.

### What the rotation tool does NOT touch

- **`repositories.escrowed_key`** uses a passphrase-derived cipher,
  separate from `ENCRYPTION_KEY`. Re-escrow each repository manually if
  you've forgotten the escrow passphrase.
- **API token hashes** are SHA-256 hashes; rotation has nothing to do.
- **Backup data itself** is encrypted by Restic with the per-repository
  password. That password gets re-encrypted with the new key, but the
  Restic-side encryption is unchanged.

### Recovery if rotation fails partway

The DB rewrite is wrapped in a single SQLite transaction — if any field
fails to decrypt or re-encrypt, the entire pass rolls back and the DB
is left exactly as it was. The env file is only updated AFTER the DB
transaction commits.

If the DB rotates but the env file write fails (rare — disk full,
permissions, etc.), the rotation tool prints the new key to the console
and exits with a non-zero status. Write the printed key to the env file
manually, then restart the service.

If you need to roll back manually, the previous env file is backed up
alongside the active one as `server.env.pre-rotation-<timestamp>`.
Restore it and restart — but only if no rotation has been performed
since (otherwise the DB is encrypted under a key that backup doesn't
contain).

## Reporting security issues

See [SECURITY.md in the repository root](../SECURITY.md) (if present) or
contact the maintainers directly. Please do not file public GitHub
issues for security bugs.
