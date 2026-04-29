# InfraOS ↔ BackupOS Federation

**Status**: Design  
**Date**: 2026-04-29  
**Author**: Darius Vorster  
**Issue**: #106

---

## Goal

InfraOS is the central control plane for the Homelab OS family. BackupOS is one of many integrations that InfraOS displays and orchestrates. InfraOS needs to pull operational state from each BackupOS instance — backup health, registered services, recent runs, repository status — and surface it as a unified view across all integrations.

This document specifies the federation contract: how InfraOS authenticates against BackupOS, what data BackupOS exposes, and how the two stay in sync.

## Non-goals (V1)

- InfraOS pushing config or commands TO BackupOS (read-only direction first)
- mTLS, OAuth, or SSO-derived auth (manual API tokens only)
- Multi-tenant BackupOS instances with per-tenant scoping (single-tenant only)
- Real-time websocket sync (poll-based only — InfraOS pulls every N minutes)
- Cross-instance backup orchestration ("back up this Postgres on InfraOS-tracked host X")

## Architecture

InfraOS maintains a record of each connected BackupOS instance (URL, token, last-sync-at, health). BackupOS does NOT need to know about InfraOS specifically — it just exposes a generic integration API that any consumer (InfraOS today, others tomorrow) can call.

InfraOS calls BackupOS via HTTPS with Bearer token authentication. BackupOS validates the token, checks scopes, rate-limits per-token, and returns data. The integration API surface is read-only in V1.

## Authentication

### Token model

BackupOS generates **scoped API tokens** intended for external consumers. Different from the existing `apiTokens` table (which is for human users) — these are integration tokens with a different purpose and scope set.

New table: `integration_tokens`

```sql
CREATE TABLE integration_tokens (
  id            text PRIMARY KEY,
  name          text NOT NULL,           -- 'InfraOS — homelab', user-supplied label
  token_hash    text NOT NULL UNIQUE,    -- SHA-256 of the actual token; raw token never stored
  token_prefix  text NOT NULL,           -- first 8 chars of token for UI display
  scopes        text NOT NULL,           -- JSON array: ["backup:read", "jobs:read", ...]
  expires_at    integer,                 -- nullable; null = never expires
  created_at    integer NOT NULL,
  created_by    text NOT NULL REFERENCES user(id),
  last_used_at  integer,                 -- updated on every authenticated request
  revoked_at    integer,                 -- soft delete; revoked tokens stay for audit
  rate_limit_rpm integer NOT NULL DEFAULT 60
);

CREATE INDEX integration_tokens_hash_idx ON integration_tokens(token_hash);
```

Token format: `bos_int_<32-char base62 random>` — prefix lets server quickly distinguish integration tokens from user tokens.

### Scopes

V1 scopes (read-only):

| Scope | Grants access to |
|---|---|
| `instance:read` | GET /instance — version, name, public URL |
| `services:read` | GET /services — registered infra_os_services + coverage |
| `jobs:read` | GET /jobs — backup job list + last run status |
| `runs:read` | GET /runs — recent backup runs (last 100 by default) |
| `agents:read` | GET /agents — agent list + online status |
| `repositories:read` | GET /repositories — repo list + size + snapshot counts |
| `monitors:read` | GET /monitors — monitor list + last sync status |
| `health:read` | GET /health — consolidated rollup |

Each scope is independent. Tokens can be granted any subset. UI presents scopes as checkboxes when creating a token.

### Authentication flow

1. Admin in BackupOS UI: `/settings/api-tokens` → click "New integration token"
2. Form: name, scopes (checkboxes), expires_at (default: 90 days)
3. Submit → server generates token, stores hash, returns RAW token ONCE
4. UI displays raw token with Copy button + "This token will only be shown once" warning
5. Admin copies token, pastes into InfraOS connector form
6. InfraOS stores: `{ url, token_encrypted_at_rest }` for the BackupOS instance

For each subsequent request:
- InfraOS sends `Authorization: Bearer bos_int_<token>`
- BackupOS hashes the token, looks up in `integration_tokens`, verifies token exists, not revoked, not expired, has the scope required for the requested endpoint
- On success: update `last_used_at`, return data
- On failure: 401 with reason in body

### Rate limiting

Per-token rate limit (default 60 rpm) prevents a buggy InfraOS poller from hammering BackupOS. Implementation: in-memory token-bucket per token id, reset every minute. Configurable via `rate_limit_rpm` column.

### Revocation

Admin can revoke a token from `/settings/api-tokens`. Sets `revoked_at`. Subsequent calls with that token return 401 + `{ "error": "token revoked" }`. Audit log records revocation.

## Read API contract

All endpoints under `/api/v1/integration/*`. JSON responses. ISO 8601 timestamps. Paginated where lists could grow large.

### `GET /api/v1/integration/instance`

**Scope**: `instance:read`

```json
{
  "name": "BackupOS — homelab",
  "version": "0.x.y",
  "public_url": "https://backupos.example.com",
  "instance_id": "uuid"
}
```

### `GET /api/v1/integration/services`

**Scope**: `services:read`

```json
{
  "services": [
    {
      "id": "uuid",
      "name": "PostgreSQL main",
      "service_type": "database",
      "host": "db.internal:5432",
      "description": "...",
      "covered": true,
      "linked_jobs": ["job-uuid-1"]
    }
  ],
  "summary": { "total": 12, "covered": 9, "uncovered": 3 }
}
```

### `GET /api/v1/integration/jobs`

**Scope**: `jobs:read`. Query: `?limit=50&cursor=<opaque>`

```json
{
  "jobs": [
    {
      "id": "uuid",
      "name": "nightly-postgres",
      "schedule": "0 3 * * *",
      "enabled": true,
      "source_type": "database",
      "repository_id": "uuid",
      "last_run": {
        "id": "uuid",
        "status": "success",
        "started_at": "2026-04-29T03:00:00Z",
        "completed_at": "2026-04-29T03:04:12Z",
        "duration_ms": 252000,
        "size_bytes": 1843200000
      },
      "next_run_at": "2026-04-30T03:00:00Z"
    }
  ],
  "next_cursor": null,
  "summary": { "total": 24, "enabled": 22, "with_failed_last_run": 1 }
}
```

### `GET /api/v1/integration/runs`

**Scope**: `runs:read`. Query: `?limit=100&cursor&status&since`

Paginated list of backup runs across all jobs. Most recent first.

### `GET /api/v1/integration/agents`

**Scope**: `agents:read`

```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "homelab-prod-01",
      "online": true,
      "last_seen_at": "2026-04-29T19:30:12Z",
      "version": "0.x.y",
      "platform": "linux/amd64",
      "channel": "stable"
    }
  ],
  "summary": { "total": 4, "online": 3, "offline": 1 }
}
```

### `GET /api/v1/integration/repositories`

**Scope**: `repositories:read`. Returns repo list with backend type, public URL (NOT credentials), total size, snapshot count, last-check status.

**Critical**: NEVER return decrypted repo passwords, restic passphrases, escrow keys, or any encrypted material. The integration API is read-only metadata, not secrets.

### `GET /api/v1/integration/monitors`

**Scope**: `monitors:read`. Returns monitor list with type, last-synced-at, status (PBS, Borg, etc.).

### `GET /api/v1/integration/health`

**Scope**: `health:read`. Consolidated rollup that InfraOS uses to render a single health pill per BackupOS instance.

```json
{
  "status": "yellow",
  "checks": [
    { "name": "agents", "status": "green", "detail": "3/3 online" },
    { "name": "recent_jobs", "status": "yellow", "detail": "1 of 24 jobs failed in last 24h" },
    { "name": "repositories", "status": "green", "detail": "all 5 repos healthy" },
    { "name": "monitors", "status": "green", "detail": "all monitors syncing" },
    { "name": "coverage", "status": "yellow", "detail": "3 of 12 services uncovered" }
  ],
  "computed_at": "2026-04-29T19:35:00Z"
}
```

`status` is the worst of all checks. green > yellow > red.

## InfraOS side (informational — not built here)

InfraOS adds a "Connected products" or "Integrations" section. For each BackupOS instance:

- Stores: `{ id, name, url, token_encrypted, last_sync_at, last_health }`
- Polls `/api/v1/integration/health` every 60 seconds (lightweight)
- Polls full data every 5 minutes (heavier)
- Caches responses; UI reads from cache, not live calls
- Renders a tile/card per BackupOS instance with the health rollup
- Drilling into a tile shows the detailed views (jobs, services, etc.) — all backed by cached data

InfraOS schema additions (separate work, separate repo):
```sql
CREATE TABLE integrations (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  product_type    text NOT NULL,
  base_url        text NOT NULL,
  token_encrypted text NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  last_sync_at    integer,
  last_health     text,
  created_at      integer NOT NULL
);
```

## Migration impact on existing infra_os_services

The existing `infra_os_services` table stays. It's the source of truth for "what BackupOS knows about." When InfraOS pulls services via the integration API, BackupOS reads from this table.

**No data migration required.** The naming collision is solved by:
- User-facing label inside BackupOS: rename "Infra OS services" → "Coverage"
- URL stays `/settings/infra-os` (preserves bookmarks)
- DB table stays `infra_os_services`
- Settings landing page: rename the link "Infra OS services" → "Coverage"

The reciprocal future feature is: when InfraOS itself manages a Postgres host, it could register that host into BackupOS automatically using a `services:write` scope. But that's V2.

## Security considerations

1. **Token leak blast radius**: V1 scopes are read-only. A leaked token reveals operational state but cannot mutate anything.

2. **Encrypted at rest in InfraOS**: tokens stored on the InfraOS side must be encrypted with InfraOS's existing field-encryption helper.

3. **HTTPS required for production**: BackupOS over plain HTTP is acceptable for homelab LAN use, but the integration token should be transmitted over TLS in any production deployment. Document this in the setup guide.

4. **Audit logging**: every integration token use writes an audit_log entry (action: `integration.api_called`, actor: token id, resource: endpoint path).

5. **Token rotation UX**: when rotated, InfraOS must update its stored token without dropping the connection. Pattern: admin generates new token in BackupOS, pastes into InfraOS "Rotate token" form, InfraOS verifies new token works, then discards old. Old token has 24h grace.

6. **Token expiration**: 90-day default with warning emails at 7 days, 1 day before expiry. UI surfaces expiry on `/settings/api-tokens`.

7. **Rate limit defense**: 60 rpm default. Misconfigured poller hitting limits gets a clear 429 with retry-after header.

## Implementation rollout

### Issue 1: BackupOS — `integration_tokens` table + token CRUD

Schema migration, server actions, settings UI. New table, drizzle schema additions, hashing helpers, scope validation, admin UI section in /settings/api-tokens.

### Issue 2: BackupOS — `/api/v1/integration/*` endpoints

REST API surface. New route handler with auth middleware, all 8 endpoints, in-memory rate limiter, audit log integration.

### Issue 3: BackupOS — Coverage rename + dropdown + create-job button

The simple UX work originally in #106. Independent of phases 1 and 2.

### Issue 4 (separate, in InfraOS repo): InfraOS — BackupOS adapter

InfraOS-side consumer. Schema, integrations form, periodic poll jobs, cache, UI tiles. Out of scope for BackupOS work.

## Decision log

- **Token format `bos_int_<base62>`**: distinguishes integration tokens from human user tokens at the prefix level
- **SHA-256 hashing, not bcrypt**: integration tokens are high-entropy random strings (190+ bits), so bcrypt's slow-hash protection isn't needed
- **Read-only V1**: keeps the security surface tiny. Mutating scopes are V2
- **Poll, not push/websocket**: simpler to implement and reason about
- **Per-token rate limit, not global**: protects against a single misconfigured consumer
- **Stable instance_id**: lets InfraOS detect when a BackupOS URL changes vs. a new BackupOS instance entirely

## Out of scope explicitly

- Webhook-style push from BackupOS to InfraOS on alert events
- Triggering BackupOS jobs from InfraOS UI
- Federated alerts (BackupOS alerts forwarded through InfraOS to chat integrations)
- BackupOS auto-discovering InfraOS instances on the LAN
- Multi-region BackupOS clusters with cross-region failover
- Anything involving managing InfraOS from inside BackupOS
