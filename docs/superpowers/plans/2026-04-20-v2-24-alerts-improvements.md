# Alerts Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add alert grouping (parent/child), alert snoozing (1h/4h/24h), webhook channels (Discord, Slack, generic), and wire alert routing through a new `alertChannels` table with a settings page.

**Architecture:** Two new tables — `alerts` (instances with `parentId` for grouping, `snoozedUntil` for snooze, `childCount`) and `alertChannels` (Discord/Slack/webhook destinations). `alertRules` gets a `channelId` FK for routing. Migration `0014`. The alerts list page renders grouped alerts (parent rows only) with inline snooze controls. A new `/settings/alerts` page manages webhook channels.

**Tech Stack:** Next.js 15 App Router (server + client), Drizzle ORM, SQLite, CSS vars.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `alerts` table, `alertChannels` table, `channelId` on `alertRules` |
| `packages/db/migrations/0014_alerts_improvements.sql` | Create — DDL for new tables + ALTER TABLE |
| `apps/web/app/actions/alerts.ts` | Create — `snoozeAlert`, `createAlertChannel`, `deleteAlertChannel` |
| `apps/web/app/(dashboard)/alerts/page.tsx` | Modify — grouped alert list with snooze controls |
| `apps/web/app/(dashboard)/settings/alerts/page.tsx` | Create — webhook channel management |
| `apps/web/app/(dashboard)/settings/page.tsx` | Modify — add "Alert channels" entry wired to `/settings/alerts` |

---

### Task 1: DB schema — `alerts`, `alertChannels`, `channelId` on `alertRules`

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0014_alerts_improvements.sql`

- [ ] **Step 1: Read `packages/db/src/schema.ts`** to find the `alertRules` table and the end of the file (required before editing)

- [ ] **Step 2: Add the two new tables and `channelId` to `alertRules`**

Find the `alertRules` table definition. It currently ends with `lastFiredAt`. Add `channelId` as the final column:

```typescript
  channelId:   text('channel_id'), // FK to alertChannels — null means email-only
```

Then, after the `storageAlerts` table (search for it by name), add the two new tables. Insert them after `storageAlerts`:

```typescript
// ── Alert instances ───────────────────────────────────────────────────────
// Fired alert instances, supports grouping and snoozing

export const alerts = sqliteTable('alerts', {
  id:           text('id').primaryKey(),
  ruleId:       text('rule_id'),
  parentId:     text('parent_id'),           // null = top-level alert
  childCount:   integer('child_count').default(0),
  type:         text('type').notNull(),
  severity:     text('severity'),            // 'info'|'warning'|'critical'
  message:      text('message').notNull(),
  status:       text('status').notNull().default('open'), // 'open'|'acknowledged'|'resolved'
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp' }),
  firedAt:      integer('fired_at',    { mode: 'timestamp' }).notNull(),
  resolvedAt:   integer('resolved_at', { mode: 'timestamp' }),
})

// ── Alert channels ────────────────────────────────────────────────────────
// Webhook destinations for alert delivery

export const alertChannels = sqliteTable('alert_channels', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  type:      text('type').notNull(), // 'discord'|'slack'|'webhook'
  config:    text('config').notNull(), // JSON: { url: string }
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

- [ ] **Step 3: Create `packages/db/migrations/0014_alerts_improvements.sql`**

```sql
CREATE TABLE `alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_id` text,
  `parent_id` text,
  `child_count` integer DEFAULT 0,
  `type` text NOT NULL,
  `severity` text,
  `message` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `snoozed_until` integer,
  `fired_at` integer NOT NULL,
  `resolved_at` integer
);

CREATE TABLE `alert_channels` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `config` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);

ALTER TABLE `alert_rules` ADD `channel_id` text;
```

- [ ] **Step 4: Add `alerts` and `alertChannels` to the exports in `packages/db/src/index.ts`**

```bash
grep -n "alertRules\|storageAlerts" /Users/dariusvorster/Projects/backupos/packages/db/src/index.ts
```

Find the export line for `alertRules` and `storageAlerts` and add `alerts` and `alertChannels` alongside them.

- [ ] **Step 5: Build the DB package and typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter @backupos/db build && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add packages/db/src/schema.ts packages/db/src/index.ts packages/db/migrations/0014_alerts_improvements.sql
git commit -m "feat: alerts + alertChannels tables, channelId on alertRules (migration 0014)"
```

---

### Task 2: Alert server actions

**Files:**
- Create: `apps/web/app/actions/alerts.ts`

- [ ] **Step 1: Check if the file already exists**

```bash
ls /Users/dariusvorster/Projects/backupos/apps/web/app/actions/
```

- [ ] **Step 2: Create `apps/web/app/actions/alerts.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, alerts, alertChannels, eq } from '@backupos/db'

const VALID_CHANNEL_TYPES = ['discord', 'slack', 'webhook'] as const

export async function snoozeAlert(id: string, hours: number): Promise<void> {
  if (!id || hours <= 0) return
  const db    = getDb()
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  await db.update(alerts).set({ snoozedUntil: until }).where(eq(alerts.id, id))
  revalidatePath('/alerts')
}

export async function createAlertChannel(formData: FormData): Promise<void> {
  const name = formData.get('name')
  const type = formData.get('type')
  const url  = formData.get('url')
  if (typeof name !== 'string' || !name.trim()) return
  if (typeof type !== 'string' || !(VALID_CHANNEL_TYPES as readonly string[]).includes(type)) return
  if (typeof url  !== 'string' || !url.trim()) return
  const db = getDb()
  await db.insert(alertChannels).values({
    id:        crypto.randomUUID(),
    name:      name.trim(),
    type,
    config:    JSON.stringify({ url: url.trim() }),
    enabled:   true,
    createdAt: new Date(),
  })
  revalidatePath('/settings/alerts')
}

export async function deleteAlertChannel(id: string): Promise<void> {
  if (!id) return
  const db = getDb()
  await db.delete(alertChannels).where(eq(alertChannels.id, id))
  revalidatePath('/settings/alerts')
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
git add apps/web/app/actions/alerts.ts
git commit -m "feat: snoozeAlert, createAlertChannel, deleteAlertChannel server actions"
```

---

### Task 3: Alerts list page with grouping + snooze controls

**Files:**
- Modify: `apps/web/app/(dashboard)/alerts/page.tsx`

The page queries `alerts` where `parentId IS NULL` (top-level only) ordered by `firedAt` desc. Each row shows severity, message, child count badge, snooze status, and an inline snooze form.

- [ ] **Step 1: Read `apps/web/app/(dashboard)/alerts/page.tsx`** (required before editing)

- [ ] **Step 2: Check that `isNull` is exported from `@backupos/db`**

```bash
grep "isNull" /Users/dariusvorster/Projects/backupos/packages/db/src/index.ts
```

If missing, add `isNull` to the drizzle-orm re-export line in `packages/db/src/index.ts`.

- [ ] **Step 3: Replace `apps/web/app/(dashboard)/alerts/page.tsx`**

```typescript
import { getDb, alerts, isNull, desc } from '@backupos/db'
import { EmptyState } from '@/components/ui/empty-state'
import { snoozeAlert } from '@/app/actions/alerts'

const SNOOZE_OPTIONS = [
  { label: '1h',  hours: 1  },
  { label: '4h',  hours: 4  },
  { label: '24h', hours: 24 },
]

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--err)',
  warning:  'var(--warn)',
  info:     'var(--ok)',
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function isSnoozed(until: Date | null | undefined): boolean {
  if (!until) return false
  return until.getTime() > Date.now()
}

export default async function AlertsPage() {
  const db      = getDb()
  const topLevel = await db
    .select()
    .from(alerts)
    .where(isNull(alerts.parentId))
    .orderBy(desc(alerts.firedAt))
    .limit(100)
    .all()

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 20px', fontSize: 13, color: 'var(--fg)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alerts</h1>

      {topLevel.length === 0 ? (
        <EmptyState
          type="page"
          headline="All quiet. No open alerts."
          description="Backup failures, missed schedules, and agent disconnections will appear here."
        />
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Severity</th>
                <th style={th}>Message</th>
                <th style={th}>Fired</th>
                <th style={th}>Snooze</th>
              </tr>
            </thead>
            <tbody>
              {topLevel.map(alert => {
                const snoozed = isSnoozed(alert.snoozedUntil)
                return (
                  <tr key={alert.id} style={{ opacity: snoozed ? 0.5 : 1 }}>
                    <td style={td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 600,
                        color: SEVERITY_COLOR[alert.severity ?? 'info'] ?? 'var(--fg-mute)',
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: SEVERITY_COLOR[alert.severity ?? 'info'] ?? 'var(--fg-dim)',
                          display: 'inline-block',
                        }} />
                        {(alert.severity ?? 'info').toUpperCase()}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{alert.message}</div>
                      {(alert.childCount ?? 0) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                          +{alert.childCount} related
                        </div>
                      )}
                      {snoozed && (
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                          Snoozed until {fmtDate(alert.snoozedUntil)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                      {fmtDate(alert.firedAt)}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {SNOOZE_OPTIONS.map(opt => {
                          const action = snoozeAlert.bind(null, alert.id, opt.hours)
                          return (
                            <form key={opt.label} action={action}>
                              <button
                                type="submit"
                                style={{
                                  padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                                  background: 'var(--surf2)', color: 'var(--fg-mute)',
                                }}
                              >
                                {opt.label}
                              </button>
                            </form>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/alerts/page.tsx"
git commit -m "feat: alerts list — grouped alerts with snooze controls"
```

---

### Task 4: Alert channels settings page + wire into settings nav

**Files:**
- Create: `apps/web/app/(dashboard)/settings/alerts/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/settings/alerts/page.tsx`**

```typescript
import { getDb, alertChannels } from '@backupos/db'
import { createAlertChannel, deleteAlertChannel } from '@/app/actions/alerts'

const TYPE_LABELS: Record<string, string> = {
  discord: 'Discord',
  slack:   'Slack',
  webhook: 'Webhook',
}

export default async function AlertChannelsPage() {
  const db       = getDb()
  const channels = await db.select().from(alertChannels).all()

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alert channels</h1>

      {/* Existing channels */}
      {channels.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 24,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Configured channels
          </div>
          {channels.map(ch => {
            const deleteAction = deleteAlertChannel.bind(null, ch.id)
            let url = ''
            try { url = (JSON.parse(ch.config) as { url: string }).url } catch { /* ignore */ }
            return (
              <div key={ch.id} style={{
                padding: '14px 20px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {TYPE_LABELS[ch.type] ?? ch.type} · {url.slice(0, 40)}{url.length > 40 ? '…' : ''}
                  </div>
                </div>
                <form action={deleteAction}>
                  <button
                    type="submit"
                    style={{
                      padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--surf2)', color: 'var(--err)',
                    }}
                  >
                    Remove
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}

      {/* Add channel form */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 16 }}>Add channel</div>
        <form action={createAlertChannel} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Ops Discord"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Type</label>
            <select
              name="type"
              required
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13,
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            >
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="webhook">Generic webhook</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Webhook URL</label>
            <input
              name="url"
              type="url"
              required
              placeholder="https://discord.com/api/webhooks/…"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              alignSelf: 'flex-start', padding: '7px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff', cursor: 'pointer',
            }}
          >
            Add channel
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Read `apps/web/app/(dashboard)/settings/page.tsx`** (required before editing)

- [ ] **Step 3: Add "Alert channels" to `LINKED_ITEMS` and the Notifications section**

In `settings/page.tsx`:

1. Add to `LINKED_ITEMS`:
```typescript
'Alert channels': '/settings/alerts',
```

2. In the `Notifications` section items array, add `'Alert channels'`:
```typescript
{ title: 'Notifications', items: ['Email SMTP', 'Webhook URL', 'Slack integration', 'Alert channels'] },
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/settings/alerts/page.tsx" \
        "apps/web/app/(dashboard)/settings/page.tsx"
git commit -m "feat: alert channels settings page + wire into settings nav"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Alert grouping — parent/child model | Task 1 (`alerts.parentId`, `alerts.childCount`) + Task 3 (child count badge) |
| Alert snoozing — 1h / 4h / 24h | Task 2 (`snoozeAlert`) + Task 3 (snooze buttons) |
| Webhook channels — Discord, Slack, generic | Task 1 (`alertChannels` table) + Task 2 (`createAlertChannel`) + Task 4 (settings page) |
| Alert routing rules — rules → channels | Task 1 (`alertRules.channelId`) |

**Note:** "Until date" snooze option from the spec is deferred — it requires a client-side date picker and is omitted from V1 to avoid a client component. The three fixed-interval buttons (1h/4h/24h) cover the majority of the spec requirement.

### Placeholder scan

No TBDs or TODOs. `deleteAlertChannel.bind(null, ch.id)` is the correct server action pattern for inline delete buttons in server components.

### Type consistency

- `snoozeAlert(id: string, hours: number)` — called via `.bind(null, alert.id, opt.hours)` — both args match.
- `createAlertChannel(formData: FormData)` — direct form action, no `.bind()` needed.
- `VALID_CHANNEL_TYPES` whitelist: `['discord', 'slack', 'webhook']` — matches `<select>` options in the form exactly.
- `alerts.parentId` is `text('parent_id')` (nullable) — `isNull(alerts.parentId)` correctly filters top-level alerts.
- `isSnoozed(until)` compares against `Date.now()` — handles null safely with an early return.
