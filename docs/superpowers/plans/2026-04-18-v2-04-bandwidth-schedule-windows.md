# Bandwidth & Schedule Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bandwidth profile management (time-of-day throttle schedules) with a settings page, per-job assignment, and a dashboard widget.

**Architecture:** Two new DB tables (`bandwidth_profiles`, `bandwidth_rules`) hold named throttle schedules. Server actions create/delete profiles and assign them to jobs. A shared utility library computes active limits and builds sparkline data. Three UI surfaces: a settings page to manage profiles, a job-detail section to assign a profile, and a dashboard widget showing the current effective limit.

**Tech Stack:** Next.js 15 App Router, React 19 (server + client components), Drizzle ORM + better-sqlite3 (`@backupos/db`), CSS custom properties, Next.js Server Actions, SVG for sparkline charts.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `bandwidthProfiles` + `bandwidthRules` tables, add `bandwidthProfileId` to `backupJobs` |
| `apps/web/app/actions/bandwidth.ts` | Create — server actions: createProfile, deleteProfile, addRule, deleteRule, setJobProfile |
| `apps/web/lib/bandwidth.ts` | Create — pure utility: getActiveRule, fmtLimit, build24hSparklineValues |
| `apps/web/app/(dashboard)/settings/bandwidth/page.tsx` | Create — server component, lists profiles + renders `<BandwidthProfileManager>` |
| `apps/web/components/bandwidth-profile-manager.tsx` | Create — client component, profile CRUD + rule editor inline |
| `apps/web/app/(dashboard)/settings/page.tsx` | Modify — add Link to `/settings/bandwidth` |
| `apps/web/app/(dashboard)/jobs/[id]/page.tsx` | Modify — add bandwidth profile section with form |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Modify — add bandwidth widget (current limit + sparkline) |

---

### Task 1: DB Schema — bandwidth_profiles + bandwidth_rules tables

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Read schema.ts**

```bash
cat packages/db/src/schema.ts
```

- [ ] **Step 2: Add bandwidthProfileId to backupJobs and two new tables**

In `packages/db/src/schema.ts`, add `bandwidthProfileId` column to `backupJobs`:

```typescript
export const backupJobs = sqliteTable('backup_jobs', {
  // ... existing columns ...
  bandwidthProfileId: text('bandwidth_profile_id'),
})
```

Then append at the end of the file:

```typescript
export const bandwidthProfiles = sqliteTable('bandwidth_profiles', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  isGlobal:    integer('is_global', { mode: 'boolean' }).default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const bandwidthRules = sqliteTable('bandwidth_rules', {
  id:        text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => bandwidthProfiles.id),
  startHour: integer('start_hour').notNull(),
  endHour:   integer('end_hour').notNull(),
  limitKbps: integer('limit_kbps'),
})
```

- [ ] **Step 3: Verify `packages/db/src/index.ts` exports the new tables**

Check that `packages/db/src/index.ts` has `export * from './schema'` (it should already — just confirm).

- [ ] **Step 4: Generate and run the migration**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
```

Expected: migration files created in `packages/db/drizzle/`, migration runs without error.

- [ ] **Step 5: Rebuild db package so web can see new types**

```bash
pnpm --filter @backupos/db build
```

Expected: build exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: add bandwidth_profiles and bandwidth_rules schema"
```

---

### Task 2: Server Actions — bandwidth CRUD + job assignment

**Files:**
- Create: `apps/web/app/actions/bandwidth.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
// apps/web/app/actions/bandwidth.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, bandwidthProfiles, bandwidthRules, backupJobs } from '@backupos/db'
import { eq } from 'drizzle-orm'

export async function createProfile(formData: FormData): Promise<void> {
  const name        = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const isGlobal    = formData.get('isGlobal') === 'on'
  if (!name) return

  const db = getDb()

  if (isGlobal) {
    await db.update(bandwidthProfiles)
      .set({ isGlobal: false })
      .where(eq(bandwidthProfiles.isGlobal, true))
      .run()
  }

  await db.insert(bandwidthProfiles).values({
    id:          crypto.randomUUID(),
    name,
    description,
    isGlobal,
    createdAt:   new Date(),
  }).run()

  revalidatePath('/settings/bandwidth')
}

export async function deleteProfile(id: string): Promise<void> {
  const db = getDb()
  await db.delete(bandwidthRules).where(eq(bandwidthRules.profileId, id)).run()
  await db.delete(bandwidthProfiles).where(eq(bandwidthProfiles.id, id)).run()
  revalidatePath('/settings/bandwidth')
  revalidatePath('/dashboard')
}

export async function addRule(profileId: string, formData: FormData): Promise<void> {
  const startHour = parseInt(formData.get('startHour') as string, 10)
  const endHour   = parseInt(formData.get('endHour')   as string, 10)
  const limitRaw  = (formData.get('limitKbps') as string).trim()
  const limitKbps = limitRaw === '' ? null : parseInt(limitRaw, 10)

  if (isNaN(startHour) || isNaN(endHour)) return
  if (startHour < 0 || endHour > 24 || startHour >= endHour) return

  const db = getDb()
  await db.insert(bandwidthRules).values({
    id: crypto.randomUUID(),
    profileId,
    startHour,
    endHour,
    limitKbps,
  }).run()

  revalidatePath('/settings/bandwidth')
}

export async function deleteRule(id: string): Promise<void> {
  const db = getDb()
  await db.delete(bandwidthRules).where(eq(bandwidthRules.id, id)).run()
  revalidatePath('/settings/bandwidth')
}

export async function setJobProfile(jobId: string, formData: FormData): Promise<void> {
  const profileId = (formData.get('profileId') as string) || null
  const db = getDb()
  await db.update(backupJobs)
    .set({ bandwidthProfileId: profileId })
    .where(eq(backupJobs.id, jobId))
    .run()
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath('/dashboard')
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/actions/bandwidth.ts
git commit -m "feat: add bandwidth server actions (createProfile, deleteProfile, addRule, deleteRule, setJobProfile)"
```

---

### Task 3: Bandwidth Utility Library

**Files:**
- Create: `apps/web/lib/bandwidth.ts`

- [ ] **Step 1: Create the utility file**

```typescript
// apps/web/lib/bandwidth.ts

export const UNLIMITED_KBPS = 102_400 // 100 MB/s sentinel for "no throttle"

export interface BandwidthRule {
  startHour: number
  endHour:   number
  limitKbps: number | null
}

export function getActiveRule(rules: BandwidthRule[], hour: number): BandwidthRule | null {
  return rules.find(r => hour >= r.startHour && hour < r.endHour) ?? null
}

export function fmtLimit(limitKbps: number | null): string {
  if (limitKbps === null) return 'Unlimited'
  if (limitKbps >= 1024) return `${(limitKbps / 1024).toFixed(0)} MB/s`
  return `${limitKbps} KB/s`
}

export function build24hSparklineValues(rules: BandwidthRule[]): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    const rule = getActiveRule(rules, h)
    if (!rule || rule.limitKbps === null) return UNLIMITED_KBPS
    return rule.limitKbps
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/bandwidth.ts
git commit -m "feat: add bandwidth utility library (getActiveRule, fmtLimit, build24hSparklineValues)"
```

---

### Task 4: Bandwidth Settings Page + Profile Manager Component

**Files:**
- Create: `apps/web/app/(dashboard)/settings/bandwidth/page.tsx`
- Create: `apps/web/components/bandwidth-profile-manager.tsx`

- [ ] **Step 1: Read existing settings page for layout/import conventions**

```bash
cat apps/web/app/(dashboard)/settings/page.tsx
```

- [ ] **Step 2: Create the server page**

```typescript
// apps/web/app/(dashboard)/settings/bandwidth/page.tsx
import { getDb, bandwidthProfiles, bandwidthRules } from '@backupos/db'
import { BandwidthProfileManager } from '@/components/bandwidth-profile-manager'
import { createProfile } from '@/app/actions/bandwidth'

export default async function BandwidthSettingsPage() {
  const db       = getDb()
  const profiles = await db.select().from(bandwidthProfiles).all()
  const rules    = await db.select().from(bandwidthRules).all()

  const profilesWithRules = profiles.map(p => ({
    ...p,
    rules: rules.filter(r => r.profileId === p.id),
  }))

  return (
    <div style={{ padding: '32px 40px', maxWidth: 800 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
          Bandwidth profiles
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
          Define time-of-day throttle schedules. Assign profiles to jobs or set one as the global default.
        </div>
      </div>

      <form action={createProfile} style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        <input
          name="name"
          placeholder="Profile name"
          required
          style={{
            padding: '7px 12px', fontSize: 13,
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', width: 200,
          }}
        />
        <input
          name="description"
          placeholder="Description (optional)"
          style={{
            padding: '7px 12px', fontSize: 13,
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', flex: 1, minWidth: 160,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" name="isGlobal" />
          Set as global default
        </label>
        <button type="submit" style={{
          padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--accent)', color: '#fff',
        }}>
          Create profile
        </button>
      </form>

      <BandwidthProfileManager profiles={profilesWithRules} />
    </div>
  )
}
```

- [ ] **Step 3: Create the client BandwidthProfileManager component**

```typescript
// apps/web/components/bandwidth-profile-manager.tsx
'use client'

import { useState } from 'react'
import { deleteProfile, addRule, deleteRule } from '@/app/actions/bandwidth'
import { fmtLimit, build24hSparklineValues, UNLIMITED_KBPS, BandwidthRule } from '@/lib/bandwidth'

interface Rule {
  id:        string
  profileId: string
  startHour: number
  endHour:   number
  limitKbps: number | null
}

interface Profile {
  id:          string
  name:        string
  description: string | null
  isGlobal:    boolean
  createdAt:   Date
  rules:       Rule[]
}

interface Props {
  profiles: Profile[]
}

const HOURS = Array.from({ length: 25 }, (_, i) => i)

const inputSm: React.CSSProperties = {
  padding: '5px 8px', fontSize: 12,
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
}

function Sparkline({ rules }: { rules: BandwidthRule[] }) {
  const values = build24hSparklineValues(rules)
  const W = 168, H = 28, BAR_W = 6, GAP = 1
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {values.map((v, h) => {
        const barH = Math.max(3, Math.round((v / UNLIMITED_KBPS) * H))
        const x    = h * (BAR_W + GAP)
        const fill = v >= UNLIMITED_KBPS ? 'var(--ok)' : 'var(--warn)'
        return <rect key={h} x={x} y={H - barH} width={BAR_W} height={barH} fill={fill} opacity={0.75} rx={1} />
      })}
    </svg>
  )
}

function RuleEditor({ profileId, rules }: { profileId: string; rules: Rule[] }) {
  const [startHour, setStartHour] = useState('0')
  const [endHour,   setEndHour]   = useState('8')
  const [limitKbps, setLimitKbps] = useState('')

  async function handleAdd() {
    const fd = new FormData()
    fd.set('startHour', startHour)
    fd.set('endHour',   endHour)
    fd.set('limitKbps', limitKbps)
    await addRule(profileId, fd)
  }

  return (
    <div style={{ marginTop: 12 }}>
      {rules.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', textAlign: 'left' }}>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>Start</th>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>End</th>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>Limit</th>
              <th style={{ padding: '3px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{r.startHour}:00</td>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{r.endHour}:00</td>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{fmtLimit(r.limitKbps)}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button
                    onClick={() => deleteRule(r.id)}
                    style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={startHour} onChange={e => setStartHour(e.target.value)} style={{ ...inputSm, width: 68 }}>
          {HOURS.slice(0, 24).map(h => <option key={h} value={h}>{h}:00</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>to</span>
        <select value={endHour} onChange={e => setEndHour(e.target.value)} style={{ ...inputSm, width: 68 }}>
          {HOURS.slice(1).map(h => <option key={h} value={h}>{h}:00</option>)}
        </select>
        <input
          type="number"
          value={limitKbps}
          onChange={e => setLimitKbps(e.target.value)}
          placeholder="KB/s (blank = unlimited)"
          style={{ ...inputSm, width: 160 }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '5px 12px', fontSize: 12, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'none', color: 'var(--fg)',
          }}
        >
          Add rule
        </button>
      </div>
    </div>
  )
}

export function BandwidthProfileManager({ profiles }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (profiles.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '20px 0' }}>
        No bandwidth profiles yet. Create one above.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {profiles.map(p => (
        <div
          key={p.id}
          style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>{p.name}</span>
                {p.isGlobal && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--accent)',
                    border: '1px solid var(--accent)', borderRadius: 3,
                    padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Global default
                  </span>
                )}
              </div>
              {p.description && (
                <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>{p.description}</div>
              )}
            </div>
            <Sparkline rules={p.rules} />
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginLeft: 4 }}>
              {p.rules.length} rule{p.rules.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={e => { e.stopPropagation(); deleteProfile(p.id) }}
              style={{
                fontSize: 12, color: 'var(--fg-dim)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                padding: '3px 10px', cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
              {expanded === p.id ? '▲' : '▼'}
            </span>
          </div>

          {expanded === p.id && (
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: '14px 18px',
              backgroundColor: 'var(--surf2)',
            }}>
              <RuleEditor profileId={p.id} rules={p.rules} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/settings/bandwidth/page.tsx apps/web/components/bandwidth-profile-manager.tsx
git commit -m "feat: add bandwidth settings page and profile manager component"
```

---

### Task 5: Settings Page Navigation Wiring

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read the current settings page**

```bash
cat apps/web/app/(dashboard)/settings/page.tsx
```

- [ ] **Step 2: Add Link to /settings/bandwidth**

Find the "Bandwidth limits" item in the settings list. Replace the plain string or existing element with a `<Link>`:

```typescript
import Link from 'next/link'
```

Replace the bandwidth item (exact edit depends on what Step 1 reveals) with:

```tsx
<Link href="/settings/bandwidth" style={{
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 16px',
  backgroundColor: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--fg)', textDecoration: 'none',
  fontSize: 14,
}}>
  Bandwidth limits
  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-dim)' }}>→</span>
</Link>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/settings/page.tsx
git commit -m "feat: wire bandwidth settings link in settings nav"
```

---

### Task 6: Job Detail — Bandwidth Profile Section

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/[id]/page.tsx`

- [ ] **Step 1: Read the job detail page**

```bash
cat "apps/web/app/(dashboard)/jobs/[id]/page.tsx"
```

- [ ] **Step 2: Import bandwidth tables and setJobProfile action**

Add to imports:

```typescript
import { bandwidthProfiles } from '@backupos/db'
import { setJobProfile } from '@/app/actions/bandwidth'
import { fmtLimit } from '@/lib/bandwidth'
```

- [ ] **Step 3: Fetch profiles and bind server action in the server component body**

Add after the existing DB queries:

```typescript
const profiles = await db.select().from(bandwidthProfiles).all()
const boundSetJobProfile = setJobProfile.bind(null, job.id)
```

- [ ] **Step 4: Render the bandwidth profile section**

Add a new card section after the existing 2×2 grid, before the run history table:

```tsx
<div style={{
  backgroundColor: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '18px 20px',
  marginBottom: 24,
}}>
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
    Bandwidth profile
  </div>
  <form action={boundSetJobProfile} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <select
      name="profileId"
      defaultValue={job.bandwidthProfileId ?? ''}
      style={{
        padding: '6px 10px', fontSize: 13,
        backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
      }}
    >
      <option value="">Use global default</option>
      {profiles.map(p => (
        <option key={p.id} value={p.id}>{p.name}{p.isGlobal ? ' (global)' : ''}</option>
      ))}
    </select>
    <button type="submit" style={{
      padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      borderRadius: 'var(--radius-sm)', border: 'none',
      background: 'var(--accent)', color: '#fff',
    }}>
      Save
    </button>
  </form>
  {profiles.length === 0 && (
    <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 8 }}>
      No profiles configured. <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Create one in settings.</a>
    </div>
  )}
</div>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/jobs/[id]/page.tsx"
git commit -m "feat: add bandwidth profile selector to job detail page"
```

---

### Task 7: Dashboard Bandwidth Widget

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Read the dashboard page**

```bash
cat apps/web/app/(dashboard)/dashboard/page.tsx
```

- [ ] **Step 2: Import bandwidth tables and utilities**

Add to imports:

```typescript
import { bandwidthProfiles, bandwidthRules } from '@backupos/db'
import { build24hSparklineValues, fmtLimit, getActiveRule, UNLIMITED_KBPS, BandwidthRule } from '@/lib/bandwidth'
```

- [ ] **Step 3: Fetch global bandwidth data in the server component**

Add after existing DB queries:

```typescript
const globalProfile = await db.select()
  .from(bandwidthProfiles)
  .where(eq(bandwidthProfiles.isGlobal, true))
  .limit(1)
  .then(r => r[0] ?? null)

const globalRules: BandwidthRule[] = globalProfile
  ? await db.select().from(bandwidthRules)
      .where(eq(bandwidthRules.profileId, globalProfile.id))
      .all()
  : []

const currentHour   = new Date().getHours()
const activeRule    = getActiveRule(globalRules, currentHour)
const currentLimit  = activeRule?.limitKbps ?? null
const sparkValues   = build24hSparklineValues(globalRules)
```

- [ ] **Step 4: Add the bandwidth widget to the dashboard**

Add a new widget card in the dashboard grid (after the existing cards):

```tsx
<div style={{
  backgroundColor: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '18px 20px',
}}>
  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
    Bandwidth (global)
  </div>
  {globalProfile ? (
    <>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
        {fmtLimit(currentLimit)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 12 }}>
        {globalProfile.name} · now ({currentHour}:00)
      </div>
      {/* 24h throttle sparkline */}
      {(() => {
        const W = 168, H = 28, BAR_W = 6, GAP = 1
        return (
          <svg width={W} height={H}>
            {sparkValues.map((v, h) => {
              const barH = Math.max(3, Math.round((v / UNLIMITED_KBPS) * H))
              const x    = h * (BAR_W + GAP)
              const fill = v >= UNLIMITED_KBPS ? 'var(--ok)' : 'var(--warn)'
              return (
                <rect
                  key={h} x={x} y={H - barH}
                  width={BAR_W} height={barH}
                  fill={fill} opacity={h === currentHour ? 1 : 0.55} rx={1}
                />
              )
            })}
          </svg>
        )
      })()}
    </>
  ) : (
    <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
      No global profile set.{' '}
      <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Configure one.</a>
    </div>
  )}
</div>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: add bandwidth widget to dashboard showing global profile and 24h sparkline"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.3) | Task |
|---|---|
| Named bandwidth profiles with time-of-day throttle rules | Task 1 (schema), Task 2 (actions), Task 4 (UI) |
| Per-job profile assignment | Task 2 (setJobProfile), Task 6 (job detail UI) |
| Global default profile | Task 2 (createProfile w/ isGlobal flag), Task 4 (badge in UI) |
| Settings page for managing profiles | Task 4, Task 5 |
| Dashboard widget showing current effective limit | Task 7 |
| 24h schedule visualization | Task 3 (build24hSparklineValues), Task 4 (Sparkline component), Task 7 (SVG widget) |

### Placeholder scan

None found — all steps contain actual code.

### Type consistency

- `BandwidthRule` defined in `lib/bandwidth.ts` (Task 3) and used in `bandwidth-profile-manager.tsx` (Task 4) via import — consistent.
- `addRule(profileId, formData)` defined in Task 2, called in Task 4 `RuleEditor.handleAdd()` — consistent.
- `build24hSparklineValues` takes `BandwidthRule[]` — both Task 4 (`Sparkline`) and Task 7 pass `globalRules: BandwidthRule[]` — consistent.
- `UNLIMITED_KBPS = 102_400` used in sparkline height calculation in Task 4 and Task 7 — consistent.
