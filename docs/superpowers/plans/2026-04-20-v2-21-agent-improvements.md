# Agent Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-update channel picker, capability badges (VSS, hypervisor driver, app hooks), resource usage sparkline (CPU/RAM last 24h), and agent operational logs to the agent detail page — and surface capability badges on the agent list cards.

**Architecture:** New columns on the `agents` table store the update channel, capability flags, latest resource snapshot, and a JSON history array for sparklines. A new server action handles the channel picker form. The detail page is extended with four new sections; the list page cards get a capability badge row. No new packages required — resource sparklines are rendered as inline div bars in server components.

**Tech Stack:** Next.js 15 App Router (server components), Drizzle ORM, SQLite, `drizzle-kit push` for migrations.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add 8 columns to `agents` table |
| `packages/db/migrations/0012_agent_improvements.sql` | Create — migration SQL |
| `apps/web/app/actions/agents.ts` | Create — `setAgentUpdateChannel` server action |
| `apps/web/app/(dashboard)/agents/[id]/page.tsx` | Modify — capabilities, resource sparkline, channel picker, agent logs |
| `apps/web/app/(dashboard)/agents/page.tsx` | Modify — capability badges on list cards |

---

### Task 1: DB schema — add agent capability + resource columns

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0012_agent_improvements.sql`

- [ ] **Step 1: Read the current schema file**

```bash
head -25 /Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts
```

- [ ] **Step 2: Add columns to the agents table in schema.ts**

Find the closing `})` of the `agents` table definition (after `publicKey` line) and insert these columns before it:

```typescript
  updateChannel:     text('update_channel').default('stable'),   // 'stable' | 'beta' | 'pinned'
  hypervisorDriver:  integer('hypervisor_driver',  { mode: 'boolean' }),
  appHooksAvailable: integer('app_hooks_available', { mode: 'boolean' }),
  cpuPct:            integer('cpu_pct'),          // latest CPU %
  ramBytes:          integer('ram_bytes'),         // latest RAM bytes used
  diskReadBps:       integer('disk_read_bps'),     // latest disk read bytes/sec
  diskWriteBps:      integer('disk_write_bps'),    // latest disk write bytes/sec
  resourceHistory:   text('resource_history'),     // JSON: [{ts,cpuPct,ramBytes}]
```

The agents table should now end:

```typescript
export const agents = sqliteTable('agents', {
  id:                text('id').primaryKey(),
  name:              text('name').notNull(),
  hostname:          text('hostname'),
  ip:                text('ip'),
  osInfo:            text('os_info'),
  platform:          text('platform'),
  arch:              text('arch'),
  vssAvailable:      integer('vss_available', { mode: 'boolean' }),
  agentVersion:      text('agent_version'),
  status:            text('status').default('disconnected'),
  lastSeenAt:        integer('last_seen_at',   { mode: 'timestamp' }),
  enrolledAt:        integer('enrolled_at',    { mode: 'timestamp' }).notNull(),
  publicKey:         text('public_key').notNull(),
  updateChannel:     text('update_channel').default('stable'),
  hypervisorDriver:  integer('hypervisor_driver',  { mode: 'boolean' }),
  appHooksAvailable: integer('app_hooks_available', { mode: 'boolean' }),
  cpuPct:            integer('cpu_pct'),
  ramBytes:          integer('ram_bytes'),
  diskReadBps:       integer('disk_read_bps'),
  diskWriteBps:      integer('disk_write_bps'),
  resourceHistory:   text('resource_history'),
})
```

- [ ] **Step 3: Create the migration file**

Create `packages/db/migrations/0012_agent_improvements.sql` with:

```sql
ALTER TABLE `agents` ADD `update_channel` text DEFAULT 'stable';
ALTER TABLE `agents` ADD `hypervisor_driver` integer;
ALTER TABLE `agents` ADD `app_hooks_available` integer;
ALTER TABLE `agents` ADD `cpu_pct` integer;
ALTER TABLE `agents` ADD `ram_bytes` integer;
ALTER TABLE `agents` ADD `disk_read_bps` integer;
ALTER TABLE `agents` ADD `disk_write_bps` integer;
ALTER TABLE `agents` ADD `resource_history` text;
```

- [ ] **Step 4: Apply the migration**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter @backupos/db exec drizzle-kit push 2>&1 | tail -10
```

Expected: no errors, migration applied.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add packages/db/src/schema.ts packages/db/migrations/0012_agent_improvements.sql
git commit -m "feat: agents schema — updateChannel, capability flags, resource columns"
```

---

### Task 2: setAgentUpdateChannel server action

**Files:**
- Create: `apps/web/app/actions/agents.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, agents, eq } from '@backupos/db'

export async function setAgentUpdateChannel(
  agentId: string,
  channel: 'stable' | 'beta' | 'pinned',
): Promise<void> {
  const db = getDb()
  await db.update(agents).set({ updateChannel: channel }).where(eq(agents.id, agentId))
  revalidatePath(`/agents/${agentId}`)
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/app/actions/agents.ts
git commit -m "feat: setAgentUpdateChannel server action"
```

---

### Task 3: Enhanced agent detail page

**Files:**
- Modify: `apps/web/app/(dashboard)/agents/[id]/page.tsx`

First, read the current file:
`apps/web/app/(dashboard)/agents/[id]/page.tsx`

The current page has: breadcrumb + h1 + Badge, 3-column StatCard grid, jobs list.

Add four new sections between the StatCard grid and the jobs list:
1. **Capabilities** — badge row for VSS, Hypervisor Driver, App Hooks
2. **Resource usage** — sparkline bars for CPU % and RAM, plus current disk I/O
3. **Update channel** — picker form (Stable / Beta / Pinned)
4. **Agent logs** — last 50 operational log entries

- [ ] **Step 1: Read the file**

```bash
cat "apps/web/app/(dashboard)/agents/[id]/page.tsx"
```

- [ ] **Step 2: Replace the file with the enhanced version**

```typescript
import type { ComponentProps } from 'react'
import { getDb, agents, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { getLogsPage } from '@/app/actions/logs'
import { setAgentUpdateChannel } from '@/app/actions/agents'

type BadgeStatus = ComponentProps<typeof Badge>['status']

interface ResourceSample { ts: number; cpuPct: number; ramBytes: number }

function parseHistory(raw: string | null): ResourceSample[] {
  if (!raw) return []
  try { return JSON.parse(raw) as ResourceSample[] } catch { return [] }
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function Sparkline({ samples, field, color }: {
  samples: ResourceSample[]
  field: 'cpuPct' | 'ramBytes'
  color: string
}) {
  if (samples.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>No data</span>
  }
  const values = samples.map(s => s[field])
  const max    = Math.max(...values, 1)
  const bars   = samples.slice(-48) // last 48 samples → ~24h at 30min intervals
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32 }}>
      {bars.map((s, i) => {
        const h = Math.max(2, Math.round((s[field] / max) * 32))
        return (
          <div
            key={i}
            title={field === 'cpuPct' ? `${s[field]}%` : fmtBytes(s[field])}
            style={{
              width: 4, height: h, borderRadius: 1,
              backgroundColor: color, flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}

function CapabilityBadge({ label, available, na }: { label: string; available: boolean | null; na?: boolean }) {
  const color = na ? 'var(--fg-dim)' : available ? 'var(--ok)' : 'var(--fg-dim)'
  const bg    = na ? 'var(--surf2)' : available ? 'color-mix(in srgb, var(--surf2) 60%, var(--ok) 10%)' : 'var(--surf2)'
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 12,
      border: '1px solid var(--border)', backgroundColor: bg, color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params
  const db      = getDb()
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) notFound()

  const jobs      = await db.select().from(backupJobs).where(eq(backupJobs.agentId, id)).all()
  const agentLogs = await getLogsPage({ entityType: 'agent', entityId: id }, 50)
  const history   = parseHistory(agent.resourceHistory ?? null)

  const boundSetChannel = setAgentUpdateChannel.bind(null, id)

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20,
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/agents" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Agents</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</h1>
          <Badge status={(agent.status ?? 'idle') as BadgeStatus} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Platform"  value={`${agent.platform ?? '—'} / ${agent.arch ?? '—'}`} />
        <StatCard label="Hostname"  value={agent.hostname ?? '—'} />
        <StatCard label="IP"        value={agent.ip ?? '—'} />
        <StatCard label="Version"   value={agent.agentVersion ?? '—'} />
        <StatCard label="VSS"       value={agent.vssAvailable ? 'Available' : agent.platform === 'windows' ? 'Unavailable' : 'N/A'} />
        <StatCard label="Last seen" value={agent.lastSeenAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'} />
      </div>

      {/* Capabilities */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>Capabilities</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CapabilityBadge
            label="VSS"
            available={agent.vssAvailable ?? false}
            na={agent.platform !== 'windows'}
          />
          <CapabilityBadge
            label="Hypervisor driver"
            available={agent.hypervisorDriver ?? false}
          />
          <CapabilityBadge
            label="App hooks"
            available={agent.appHooksAvailable ?? false}
          />
        </div>
      </div>

      {/* Resource usage */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Resource usage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>CPU</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
                {agent.cpuPct != null ? `${agent.cpuPct}%` : '—'}
              </span>
            </div>
            <Sparkline samples={history} field="cpuPct" color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>RAM</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
                {fmtBytes(agent.ramBytes ?? null)}
              </span>
            </div>
            <Sparkline samples={history} field="ramBytes" color="#22c55e" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Disk read </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-mute)' }}>
              {agent.diskReadBps != null ? `${fmtBytes(agent.diskReadBps)}/s` : '—'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Disk write </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-mute)' }}>
              {agent.diskWriteBps != null ? `${fmtBytes(agent.diskWriteBps)}/s` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Update channel */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Auto-update channel</div>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 12 }}>
          Controls which release track this agent follows for automatic updates.
        </div>
        <form action={boundSetChannel} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            name="channel"
            defaultValue={agent.updateChannel ?? 'stable'}
            style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
            }}
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
            <option value="pinned">Pinned (no auto-update)</option>
          </select>
          <button type="submit" style={{
            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
          }}>
            Save
          </button>
        </form>
      </div>

      {/* Jobs */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Backup jobs on this agent ({jobs.length})
        </div>
        {jobs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No jobs assigned to this agent</div>
        ) : (
          jobs.map(job => (
            <div key={job.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <Link href={`/jobs/${job.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                {job.name}
              </Link>
              <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{job.schedule}</span>
            </div>
          ))
        )}
      </div>

      {/* Agent logs */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Agent logs
        </div>
        {agentLogs.length === 0 ? (
          <div style={{ padding: '20px 24px', fontSize: 13, color: 'var(--fg-dim)' }}>No operational logs for this agent yet.</div>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {agentLogs.map(entry => (
              <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '6px 16px', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 152 }}>
                  {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                </span>
                <span style={{
                  fontWeight: 600, width: 44, flexShrink: 0,
                  color: ({ debug: 'var(--fg-dim)', info: 'var(--ok)', warn: 'var(--warn)', error: 'var(--err)', fatal: 'var(--err)' } as Record<string, string>)[entry.level] ?? 'var(--fg)',
                }}>
                  {entry.level.toUpperCase().slice(0, 4)}
                </span>
                <span style={{ color: 'var(--fg)', flex: 1 }}>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/agents/[id]/page.tsx"
git commit -m "feat: agent detail — capabilities badges, resource sparkline, update channel, agent logs"
```

---

### Task 4: Agent list cards — capability badges

**Files:**
- Modify: `apps/web/app/(dashboard)/agents/page.tsx`

First read the current file:
`apps/web/app/(dashboard)/agents/page.tsx`

Add a capabilities row below the existing grid on each agent card, showing VSS / Hypervisor driver / App hooks status as small inline badges.

- [ ] **Step 1: Read the file**

```bash
cat apps/web/app/(dashboard)/agents/page.tsx
```

- [ ] **Step 2: Replace the file with the updated version**

```typescript
import type { ComponentProps } from 'react'
import { Server } from 'lucide-react'
import { getDb, agents } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function CapBadge({ label, ok, na }: { label: string; ok: boolean | null; na?: boolean }) {
  const color = na ? 'var(--fg-dim)' : ok ? 'var(--ok)' : 'var(--fg-dim)'
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 10,
      border: '1px solid var(--border)', color,
      backgroundColor: ok && !na ? 'color-mix(in srgb, var(--surf2) 60%, var(--ok) 10%)' : 'var(--surf2)',
    }}>
      {label}
    </span>
  )
}

export default async function AgentsPage() {
  const db        = getDb()
  const agentList = await db.select().from(agents).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Agents</h1>
        <Button variant="primary" size="md">
          <Server size={14} />
          Enrol agent
        </Button>
      </div>

      {agentList.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <EmptyState
            type="page"
            icon={<Server size={48} />}
            headline="No agents enrolled"
            description="Install the BackupOS agent on your Linux or Windows hosts to start backing up."
          />
          <div style={{ padding: '0 24px 32px', display: 'flex', justifyContent: 'center' }}>
            <code style={{
              display: 'block',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)',
            }}>
              curl -fsSL http://localhost:3000/install.sh | bash
            </code>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {agentList.map(agent => (
            <a
              key={agent.id}
              href={`/agents/${agent.id}`}
              style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 20, textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {agent.hostname ?? agent.ip ?? '—'}
                  </div>
                </div>
                <Badge status={(agent.status ?? 'disconnected') as BadgeStatus} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Platform</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.platform ?? '—'}{agent.arch ? ` / ${agent.arch}` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Version</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.agentVersion ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Channel</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.updateChannel ?? 'stable'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Last seen</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(agent.lastSeenAt)}
                  </div>
                </div>
              </div>

              {/* Capability badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CapBadge label="VSS" ok={agent.vssAvailable ?? false} na={agent.platform !== 'windows'} />
                <CapBadge label="Hypervisor" ok={agent.hypervisorDriver ?? false} />
                <CapBadge label="App hooks" ok={agent.appHooksAvailable ?? false} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/agents/page.tsx"
git commit -m "feat: agent list — capability badges + update channel column + link cards"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Auto-update channel picker (Stable / Beta / Pinned) | Task 1 (DB column) + Task 2 (server action) + Task 3 (form on detail page) |
| Capabilities badges — VSS | Schema already had `vssAvailable`; surfaced in Task 3 (detail) + Task 4 (list) |
| Capabilities badges — Hypervisor driver | Task 1 (`hypervisorDriver` column) + Task 3 + Task 4 |
| Capabilities badges — App hooks | Task 1 (`appHooksAvailable` column) + Task 3 + Task 4 |
| Agent resource usage — CPU/RAM sparkline | Task 1 (`resourceHistory`, `cpuPct`, `ramBytes` columns) + Task 3 (`Sparkline` component) |
| Agent resource usage — disk I/O | Task 1 (`diskReadBps`, `diskWriteBps`) + Task 3 (current values shown) |
| Agent logs | Task 3 (logs section using `getLogsPage`) |

### Placeholder scan

No TBDs or TODOs. All code blocks are complete.

### Type consistency

- `ResourceSample` interface (`{ ts, cpuPct, ramBytes }`) defined in Task 3 — used only within that file.
- `Sparkline` takes `field: 'cpuPct' | 'ramBytes'` — matches `ResourceSample` keys exactly.
- `CapabilityBadge` (detail page) and `CapBadge` (list page) are independent components with the same props shape but different names — intentional, they live in different files and have slightly different styling.
- `setAgentUpdateChannel` bound with `agentId` in Task 3 — `channel` comes from form's `name="channel"` select. The server action signature `(agentId, channel)` with `bind(null, id)` means the form sends just `channel`. This pattern matches how `setJobProfile` and `togglePreflight` work elsewhere in the codebase.
