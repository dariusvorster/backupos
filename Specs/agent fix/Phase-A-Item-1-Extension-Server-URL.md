# Phase A — Item 1 Extension: Agent Server URL Configuration

> **Status:** Spec, ready for implementation. Extension to Phase A Item 1.
> **Why this exists:** The install-script generator currently uses the HTTP request's `Host` header as the embedded `BACKUPOS_URL`. This produced an agent installation on Dockee01 with the wrong URL (a Tailscale IP, when the admin had opened BackupOS over Tailscale during enrollment). The fix is to introduce a properly-configured Server URL setting that the generator reads from a stable source instead of guessing from request context.
> **Estimated effort:** 1-2 hours focused.
> **Branch:** Same branch as Phase A Item 1 (`fix/phase-a-host-agent-stabilization`)

---

## What's broken

Three places use a request-scoped URL where they should use a stable configured one:

1. `apps/web/app/install.sh/route.ts` — generates the install script users curl. Uses `process.env.BETTER_AUTH_URL ?? URL-from-request`. `BETTER_AUTH_URL` is wrong to repurpose (it's a better-auth library var for OAuth callbacks) and the request-derived fallback varies by which interface the admin is using.
2. `apps/web/app/(dashboard)/agents/[id]/page.tsx` — shows the agent install one-liner. Uses `headers().get('host')`. Same problem — the URL the admin sees depends on how they accessed the page.
3. `apps/web/app/(dashboard)/settings/general/page.tsx` — exposes general settings. Has no field for the server URL, so even an admin who knows about this issue has no way to fix it.

## What "correct" looks like

A `serverPublicUrl` setting:

- Stored in `instanceSettings` table (single-row settings table that already exists)
- Editable in Settings → General by an admin
- Has a sensible default for first-run: the value of `BACKUPOS_PUBLIC_URL` env var if set, otherwise `null` (forcing the admin to set it before any agent install will succeed)
- Read by both the install-script generator and the agent-detail page's install one-liner
- Validated as a proper URL with scheme, host, port

The setting is the **single source of truth** for "what URL agents should connect to." Request context is no longer involved.

---

## Implementation

### 1. Schema change

Add to `instanceSettings` in `packages/db/src/schema.ts`:

```typescript
serverPublicUrl: text('server_public_url'),  // e.g., http://192.168.69.52:3093 — used as agent connection target and install-script base URL
```

Drizzle migration:

```sql
ALTER TABLE instance_settings ADD COLUMN server_public_url TEXT;
```

### 2. Setting in Settings → General

In `apps/web/app/(dashboard)/settings/general/page.tsx`, add a field:

- Label: "Server URL (agent endpoint)"
- Help text: "The base URL agents and admins use to reach this server. Example: `http://192.168.69.52:3093` for a homelab on a VLAN, or `https://backupos.example.com` for a public deployment via reverse proxy. Used for the install scripts agents download — must be reachable from agent hosts. Saved value overrides any auto-detection."
- Validation: must be valid URL with scheme (`http://` or `https://`) and host. Warn (don't block) if it's `localhost`, `127.0.0.1`, or anything in `100.64.0.0/10` (CGNAT range, where Tailscale lives — homelab admins commonly want to avoid this for agent traffic).
- Save action updates `instanceSettings.serverPublicUrl`

### 3. Install-script generator

`apps/web/app/install.sh/route.ts`, replace the URL derivation:

```typescript
// Resolve the server URL in this order:
// 1. instanceSettings.serverPublicUrl (admin-set in UI) — preferred
// 2. process.env.BACKUPOS_PUBLIC_URL (deployment-set via env file)
// 3. Request-derived fallback (only as a last-resort to avoid total brokenness on first install before the UI is set up)
const settings = await getInstanceSettings()
let origin: string
if (settings.serverPublicUrl) {
  origin = settings.serverPublicUrl
} else if (process.env.BACKUPOS_PUBLIC_URL) {
  origin = process.env.BACKUPOS_PUBLIC_URL
} else {
  const u = new URL(req.url)
  origin = `${u.protocol}//${u.host}`
  console.warn('[install.sh] serverPublicUrl not configured. Falling back to request-derived URL: ' + origin + '. This may produce broken installs if the admin accessed BackupOS via a different interface than agents will use. Set this in Settings → General.')
}
```

Note `BETTER_AUTH_URL` is removed entirely from this code path — it should not be referenced here regardless of whether it happens to be set.

### 4. Agent-detail install one-liner

`apps/web/app/(dashboard)/agents/[id]/page.tsx`, lines around 82-86 — same resolution logic as the install script. Use a shared helper:

```typescript
// apps/web/lib/server-url.ts
import { getInstanceSettings } from '@/lib/settings'

export async function getServerPublicUrl(requestUrl?: string): Promise<{ url: string; source: 'setting' | 'env' | 'request' | 'unknown' }> {
  const settings = await getInstanceSettings()
  if (settings.serverPublicUrl) return { url: settings.serverPublicUrl, source: 'setting' }
  if (process.env.BACKUPOS_PUBLIC_URL) return { url: process.env.BACKUPOS_PUBLIC_URL, source: 'env' }
  if (requestUrl) {
    const u = new URL(requestUrl)
    return { url: `${u.protocol}//${u.host}`, source: 'request' }
  }
  return { url: 'http://localhost:3093', source: 'unknown' }
}
```

Use this from both call sites. Also use the `source` value in the agent-detail page UI: if the source is `'request'`, show a yellow banner above the install one-liner reading:

> ⚠️ Server URL not configured. The install command below uses your current browser's URL, which may not be the right URL for agents to connect from. Configure the canonical Server URL in Settings → General.

### 5. WebSocket URL derivation

The agent connects to `ws://<host>/ws/agent` (or `wss://` if the public URL is HTTPS). The helper computes this from `serverPublicUrl`:

```typescript
function toWebSocketUrl(httpUrl: string): string {
  const u = new URL(httpUrl)
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${u.host}/ws/agent`
}
```

Used in both the install script's `BACKUPOS_URL` value and the agent-detail page's display.

### 6. First-run UX

If `serverPublicUrl` is not set on first run AND `BACKUPOS_PUBLIC_URL` env var is not set, surface this in the dashboard prominently. Show a banner on every page (or at minimum the dashboard, agents list, and settings page) reading:

> Server URL is not configured. Until you set it in Settings → General, agent installs may produce broken connections. [Configure now]

Don't block the UI — admins should still be able to navigate and configure things. Just make the missing config impossible to miss.

### 7. Default for this deployment

Since the user is on a homelab with the BackupOS server at `192.168.69.52:3093`, the migration that adds the column should ALSO set the value to `http://192.168.69.52:3093` for this specific deployment IF the column ends up null after migration AND `BACKUPOS_PUBLIC_URL` env is unset. Mechanism:

```typescript
// In the migration's post-step or in app startup:
const settings = await db.select().from(instanceSettings).limit(1)
if (settings.length && !settings[0].serverPublicUrl) {
  const fromEnv = process.env.BACKUPOS_PUBLIC_URL
  if (fromEnv) {
    await db.update(instanceSettings).set({ serverPublicUrl: fromEnv })
    console.log('[backupos] Initialized serverPublicUrl from BACKUPOS_PUBLIC_URL env: ' + fromEnv)
  }
  // If neither setting nor env is present, leave null. UI banner will prompt admin to configure.
}
```

For tonight's bring-up, set `BACKUPOS_PUBLIC_URL=http://192.168.69.52:3093` in `/etc/backupos/server.env` so the first server start after this PR lands picks up the right value automatically. Document this in the PR description so it's clear what an existing operator needs to do.

---

## How this fixes Dockee01 specifically

Dockee01's existing `.env` is wrong but Dockee01 is *also* pointing at a non-existent server. After Item 1 lands with this extension:

1. BackupOS server is restarted with `BACKUPOS_PUBLIC_URL=http://192.168.69.52:3093` in its environment file. The migration auto-populates `serverPublicUrl` from this value.
2. In the BackupOS UI, the admin opens Dockee01's agent detail page. The install one-liner now correctly shows `BACKUPOS_URL=ws://192.168.69.52:3093/ws/agent`.
3. The admin runs the (corrected) install script's update mode on Dockee01, which now writes a `.env` with the correct URL. (This requires Item 1's other open piece: install script self-deploys to `/opt/backupos-agent/install.sh`. Together both pieces produce a workable update flow.)
4. Agent restarts, connects to the right URL, registers in the connections map.
5. Click Run-now in the UI. Dispatch via the bridge (Item 2 — already deployed). Agent receives `run_backup`. Restic actually runs.

That last step is the gate we've been trying to reach for nine hours. It will work after Item 1 is properly complete.

---

## Acceptance criteria for the extended Item 1

- [ ] `instanceSettings.serverPublicUrl` column exists, persisted across restarts
- [ ] Settings → General has a "Server URL (agent endpoint)" field, saves correctly
- [ ] Saving an invalid URL produces a clear validation error in the UI
- [ ] Saving a Tailscale-range URL produces a yellow warning but allows save (some users do want this)
- [ ] Install script `/install.sh` returns scripts with `BACKUPOS_URL` matching the configured `serverPublicUrl`, NOT the request's Host header
- [ ] Agent detail page's install one-liner uses `serverPublicUrl`, NOT the request's Host header
- [ ] When `serverPublicUrl` is null AND `BACKUPOS_PUBLIC_URL` env is unset, agent detail page shows the yellow warning banner above the install command
- [ ] Setting `BACKUPOS_PUBLIC_URL=http://192.168.69.52:3093` in server.env, restarting BackupOS, and visiting Settings → General shows the field pre-populated with that URL
- [ ] After running the corrected install script's update mode on Dockee01, `cat /opt/backupos-agent/.env` shows `BACKUPOS_URL=ws://192.168.69.52:3093/ws/agent`
- [ ] After agent restart, the agent appears in the agents table with `status=connected`, and `journalctl -u backupos-agent` shows successful WS connection to `ws://192.168.69.52:3093/ws/agent`

---

## What this extension does NOT do

- Does not fix the install-script self-deploy gap (`/opt/backupos-agent/install.sh` not present after install). That's still a separate part of Item 1.
- Does not add a "delete agent" button to the UI. That's a Phase A follow-up at most. For now, deletion still requires DB DELETE.
- Does not add a "re-enroll agent" flow. Same — follow-up. The "Update agent" button + a corrected install script + admin running update mode locally on the agent host is the supported recovery path for V1.
- Does not address Cloudflare/ProxyOS public exposure. That's later; for now `serverPublicUrl` is whatever the admin configures, including raw VLAN IPs.
- Does not migrate existing wrong `.env` files on already-installed agents. Those need to be re-installed (manually for Dockee01 tonight, automatically via the corrected update flow afterward).

---

## Implementation order within Item 1

The combined Item 1 (original + this extension + the install.sh self-deploy gap) is:

1. **a.** Schema: add `serverPublicUrl` column to `instanceSettings`
2. **b.** Server URL helper (`apps/web/lib/server-url.ts`)
3. **c.** Use helper in `install.sh/route.ts` and `agents/[id]/page.tsx`
4. **d.** Settings → General: add the field
5. **e.** First-run banner if not configured
6. **f.** Generated install script writes systemd unit with `EnvironmentFile=` (original Item 1)
7. **g.** Generated install script copies itself to `/opt/backupos-agent/install.sh` mode 0755 (the self-deploy gap)
8. **h.** Generated install script's `update` subcommand self-heals existing broken installs (rewrites unit, removes malformed override, restart)
9. **i.** Agent code: improved error message via `requireEnv()` (original Item 1)

Test at each stop. Specifically after step (g): on a fresh test host (NOT Dockee01), curl-bash the new install script, then check `/opt/backupos-agent/install.sh` exists. After step (h): on Dockee01, run the install script's update mode (now possible because (g) deployed it), check that `.env` is rewritten with the correct URL, agent restarts, agent connects.

After all of (a) through (i) merges and Dockee01 connects successfully, the rest of Phase A (Items 2-8) proceeds.

---

## A note on naming

`serverPublicUrl` is the right name even though the URL might not be "public" in the internet sense — for a homelab, "public" means "the URL agents reach BackupOS at." It's the canonical public-from-the-agent's-perspective URL. Don't bikeshed this.

If a future deployment exposes BackupOS through both a private VLAN URL (for agents) and a public Cloudflare URL (for the admin UI), they'd add a second setting (`adminPublicUrl` or similar). One thing at a time — V1 has one URL, used for both purposes.
