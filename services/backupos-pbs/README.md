# backupos-pbs

Go sidecar service for the PBS (Proxmox Backup Server) protocol surface
of BackupOS. Listens on port 8007 by default.

This service runs alongside the Node `backupos.service` as a separate
systemd unit (`backupos-pbs.service`). They share:
- The SQLite database at `/var/lib/backupos/backupos.db`
- The TLS cert/key at `/var/lib/backupos/pbs/{cert,key}.pem`
- The PBS data root at `/var/lib/backupos/pbs/`

## Why Go

The Node implementation of the PBS upgrade handshake hit a Node-internal
HTTP/2 C++ assertion (`is_write_in_progress()` at `node_http2.cc:1780`)
when handing a TLS-wrapped socket from `https.createServer` to
`http2.createServer().emit('connection', ...)`. This is not patchable
from userspace. Go's HTTP/2 stdlib handles the same pattern cleanly; the
reference implementation `tizbac/pmoxs3backuproxy` (GPL-3.0, used for
architectural understanding only — no code copied) proves the approach.

## Build

```bash
cd services/backupos-pbs
go build -o ../../bin/backupos-pbs ./cmd/backupos-pbs
```

The production deploy script (`scripts/server-install.sh`) handles this.

## Run (development)

```bash
go run ./cmd/backupos-pbs \
  --bind 0.0.0.0:8007 \
  --cert /var/lib/backupos/pbs/cert.pem \
  --key /var/lib/backupos/pbs/key.pem \
  --db /var/lib/backupos/backupos.db \
  --pbs-root /var/lib/backupos/pbs
```

## Test

```bash
go test ./...
```

## Endpoints (M4b-go-auth)

| Method | Path | Behavior |
|--------|------|----------|
| GET | /api2/json/version | 200 JSON, unauthenticated (PVE liveness probe) |
| any | /api2/json/backup | 401 without auth, 501 stub with auth |
| any | /api2/json/reader | 401 without auth, 501 stub with auth |
| any | (other) | 404 |

Authentication uses PBS token format:
`Authorization: PBSAPIToken=user@realm!tokenname:secret`

The secret is hashed with SHA-256 (no salt) and compared against the
`secret_hash` column in `pbs_tokens`. This matches the M3b Node
implementation, so existing tokens validate.

## Roadmap

This is PR 1 of approximately 12-13 in the Go pivot. Subsequent PRs:

- M4b-go-auth — token validation
- M4b-go-upgrade — HTTP/1.1 → H2 upgrade handshake
- M4b-go-session — pbs_active_sessions lifecycle
- M4b-go-datastore-lookup — ?store= validation
- M4c-go-blob — POST /blob (manifest, qemu-server.conf)
- M4c-go-fixed-index, M4c-go-dynamic-index, M4c-go-chunk-upload, M4c-go-finish
- M5-go-reader — restore protocol
- M6-go-gc — garbage collection
- M9-go-hardening — cert rotation, session sweeper, observability
