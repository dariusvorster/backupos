# Infra OS Service-Aware Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard card "Services without backups" listing manually registered services that have no backup job, each with a one-click "Create recommended job" link that pre-fills the new-job wizard.

**Architecture:** A new `infra_os_services` table holds service records (name, type, host, description). A nullable `infraServiceId` FK on `backupJobs` marks coverage. The dashboard queries for services with no matching job and shows a card. The new-job wizard reads URL search params (`name`, `sourceType`, `infraServiceId`) to pre-fill fields. A settings page at `/settings/infra-os` lets users add/remove services (the light version — no live API integration yet).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + better-sqlite3, TypeScript strict, CSS custom properties.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `infraOsServices` table + `infraServiceId` on `backupJobs` |
| `packages/db/migrations/` | Generated migration files |
| `apps/web/app/actions/infra-os.ts` | Create — `addInfraService`, `removeInfraService` server actions |
| `apps/web/app/(dashboard)/settings/infra-os/page.tsx` | Create — settings page to manage service registry |
| `apps/web/app/(dashboard)/settings/page.tsx` | Modify — add "Infra OS services" link |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Modify — add "Services without backups" card |
| `apps/web/app/(dashboard)/jobs/new/page.tsx` | Modify — pre-fill from URL search params |

---

### Task 1: DB Schema — infraOsServices table + infraServiceId on backupJobs

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Find insertion point in schema**

```bash
grep -n "export const backupJobs\|export const backupRuns\|export const bandwidthProfiles" packages/db/src/schema.ts | head -6
```

Read the schema file to understand the existing table structure — specifically the end of `backupJobs` (line ~85) and where to add the new table (before `backupRuns`).

- [ ] **Step 2: Add `infraOsServices` table**

After the `bandwidthRules` table definition (before `backupJobs`), add:

```typescript
// ── Infra OS service registry ─────────────────────────────────────────────
// Manually registered (or API-synced) services for coverage tracking

export const infraOsServices = sqliteTable('infra_os_services', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  serviceType: text('service_type').notNull(), // 'database' | 'filesystem' | 'container'
  host:        text('host'),
  description: text('description'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

- [ ] **Step 3: Add `infraServiceId` to `backupJobs`**

Inside the `backupJobs` table definition, after the `lastPreflightStatus` line (the last existing column), add:

```typescript
  infraServiceId: text('infra_service_id').references(() => infraOsServices.id),
```

Note: `infraOsServices` must be declared **before** `backupJobs` in the file for the self-reference to work. If `backupJobs` is declared first, move `infraOsServices` above it.

- [ ] **Step 4: Export the new table from the package**

Check `packages/db/src/index.ts` and ensure `infraOsServices` is exported:

```bash
grep "infraOsServices\|export \*" packages/db/src/index.ts
```

If the file uses `export * from './schema'`, nothing is needed. If it lists exports explicitly, add `infraOsServices` to the list.

- [ ] **Step 5: Generate migration and run against BOTH databases**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
pnpm --filter @backupos/db build
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/index.ts packages/db/migrations/
git commit -m "feat: add infraOsServices table and infraServiceId FK on backupJobs"
```

---

### Task 2: Server Actions + Settings Page

**Files:**
- Create: `apps/web/app/actions/infra-os.ts`
- Create: `apps/web/app/(dashboard)/settings/infra-os/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create `apps/web/app/actions/infra-os.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, infraOsServices } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

export async function addInfraService(formData: FormData): Promise<{ error?: string }> {
  const name        = ((formData.get('name')        ?? '') as string).trim()
  const serviceType = ((formData.get('serviceType') ?? '') as string).trim()
  const host        = ((formData.get('host')        ?? '') as string).trim()
  const description = ((formData.get('description') ?? '') as string).trim()

  if (!name)        return { error: 'Service name is required.' }
  if (!serviceType) return { error: 'Service type is required.' }

  const db = getDb()
  await db.insert(infraOsServices).values({
    id:          randomUUID(),
    name,
    serviceType,
    host:        host || null,
    description: description || null,
    createdAt:   new Date(),
  }).run()

  revalidatePath('/settings/infra-os')
  revalidatePath('/dashboard')
  return {}
}

export async function addInfraServiceAction(formData: FormData): Promise<void> {
  const result = await addInfraService(formData)
  if (result.error) throw new Error(result.error)
}

export async function removeInfraService(id: string): Promise<void> {
  const db = getDb()
  await db.delete(infraOsServices).where(eq(infraOsServices.id, id)).run()
  revalidatePath('/settings/infra-os')
  revalidatePath('/dashboard')
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/settings/infra-os/page.tsx`**

```typescript
import { getDb, infraOsServices, backupJobs } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { addInfraServiceAction, removeInfraService } from '@/app/actions/infra-os'
import Link from 'next/link'
import { Cpu } from 'lucide-react'

const SERVICE_TYPES = [
  { value: 'database',   label: 'Database',   desc: 'PostgreSQL, MySQL, Redis, etc.' },
  { value: 'filesystem', label: 'Filesystem',  desc: 'Directory or mount point' },
  { value: 'container',  label: 'Container',   desc: 'Docker container or volume' },
]

export default async function InfraOsSettingsPage() {
  const db       = getDb()
  const services = await db.select().from(infraOsServices).all()

  const coveredIds = new Set(
    (await db.select({ infraServiceId: backupJobs.infraServiceId })
      .from(backupJobs)
      .all())
      .map(j => j.infraServiceId)
      .filter(Boolean) as string[]
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Settings</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Infra OS services</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Register services here to track backup coverage. Services without a backup job appear on the dashboard.
        </p>
      </div>

      {/* Add service form */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Cpu size={16} color="var(--fg-mute)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Add service</span>
        </div>
        <form action={addInfraServiceAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Service name *</label>
              <input
                name="name"
                type="text"
                required
                placeholder="PostgreSQL main"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Host / address</label>
              <input
                name="host"
                type="text"
                placeholder="db.internal:5432"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Type *</label>
            <select
              name="serviceType"
              required
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)' }}
            >
              <option value="">— Select type —</option>
              {SERVICE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Description</label>
            <input
              name="description"
              type="text"
              placeholder="Optional notes"
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <button type="submit" style={{
              fontSize: 13, padding: '7px 16px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff',
            }}>
              Add service
            </button>
          </div>
        </form>
      </div>

      {/* Service list */}
      {services.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fg-mute)' }}>No services registered yet.</p>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {services.map((svc, i) => {
            const covered = coveredIds.has(svc.id)
            const boundRemove = removeInfraService.bind(null, svc.id)
            return (
              <div key={svc.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: covered ? 'var(--ok)' : 'var(--warn)',
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: covered
                    ? 'color-mix(in srgb, transparent 85%, var(--ok) 15%)'
                    : 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
                  border: `1px solid ${covered
                    ? 'color-mix(in srgb, transparent 70%, var(--ok) 30%)'
                    : 'color-mix(in srgb, transparent 70%, var(--warn) 30%)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {covered ? 'Covered ✓' : 'No backup ⚠'}
                </span>
                <form action={boundRemove}>
                  <button type="submit" style={{
                    fontSize: 12, padding: '3px 10px', cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    color: 'var(--fg-mute)', background: 'var(--surf2)',
                  }}>
                    Remove
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the link in `apps/web/app/(dashboard)/settings/page.tsx`**

Read the current settings page. Add `'Infra OS services': '/settings/infra-os'` to `LINKED_ITEMS` and add `'Infra OS services'` to the `'Backup defaults'` section items array.

Current `LINKED_ITEMS`:
```typescript
const LINKED_ITEMS: Record<string, string> = {
  'Bandwidth limits': '/settings/bandwidth',
}
```

Updated `LINKED_ITEMS`:
```typescript
const LINKED_ITEMS: Record<string, string> = {
  'Bandwidth limits':  '/settings/bandwidth',
  'Infra OS services': '/settings/infra-os',
}
```

Current `'Backup defaults'` items: `['Retention policy', 'Bandwidth limits', 'Schedule windows']`

Updated: `['Retention policy', 'Bandwidth limits', 'Schedule windows', 'Infra OS services']`

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any type errors. Common issue: `infraOsServices` may need explicit import from `@backupos/db`. Check with:

```bash
grep "infraOsServices" packages/db/src/index.ts
```

If not found, add to the explicit export list in `packages/db/src/index.ts`. If the file uses `export * from './schema'`, it is already exported.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/actions/infra-os.ts "apps/web/app/(dashboard)/settings/infra-os/page.tsx" "apps/web/app/(dashboard)/settings/page.tsx"
git commit -m "feat: add Infra OS service registry — settings page + server actions"
```

---

### Task 3: Dashboard "Services without backups" card

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Read the current dashboard page**

Read `apps/web/app/(dashboard)/dashboard/page.tsx`. Understand the existing imports and data fetching in the `Promise.all` block (lines 57–96).

- [ ] **Step 2: Add imports**

Add `infraOsServices` to the existing import from `@backupos/db`:

```typescript
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  verificationTests, verificationRuns, bandwidthProfiles, bandwidthRules,
  infraOsServices,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
```

Also add `isNotNull` to the drizzle imports if not present:
```typescript
import { isNotNull } from 'drizzle-orm'
```

Check first: `grep "isNotNull" packages/db/src/index.ts` — if not re-exported, import from `'drizzle-orm'` directly.

- [ ] **Step 3: Add the uncovered services query**

After the existing `Promise.all` block, add:

```typescript
  // Services with no backup job assigned
  const allServices = await db.select().from(infraOsServices).all()
  const coveredServiceIds = new Set(
    jobs.map(j => j.infraServiceId).filter((id): id is string => id !== null && id !== undefined)
  )
  const uncoveredServices = allServices.filter(s => !coveredServiceIds.has(s.id))
```

- [ ] **Step 4: Add the SOURCE_TYPE_MAP constant**

After the `uncoveredServices` assignment, add:

```typescript
  const SOURCE_TYPE_MAP: Record<string, string> = {
    database:   'database',
    filesystem: 'filesystem',
    container:  'docker_volume',
  }
```

- [ ] **Step 5: Add the dashboard card JSX**

Add the card between the bandwidth widget and the "Recent runs" table (after the closing `</div>` of the bandwidth widget div, before `{/* Recent runs table */}`):

```tsx
      {/* Services without backups */}
      {uncoveredServices.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, var(--warn) 40%)',
          borderRadius: 'var(--radius)',
          marginBottom: 32,
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>Services without backups</span>
            <span style={{
              fontSize: 12, fontWeight: 500, color: 'var(--warn)',
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
              border: '1px solid color-mix(in srgb, transparent 70%, var(--warn) 30%)',
            }}>
              {uncoveredServices.length} unprotected
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {uncoveredServices.map((svc, i) => {
              const sourceType = SOURCE_TYPE_MAP[svc.serviceType] ?? 'filesystem'
              const href = `/jobs/new?name=${encodeURIComponent(svc.name)}&sourceType=${encodeURIComponent(sourceType)}&infraServiceId=${encodeURIComponent(svc.id)}`
              return (
                <div key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                    </div>
                  </div>
                  <a
                    href={href}
                    style={{
                      fontSize: 12, padding: '4px 12px', cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)', border: 'none',
                      background: 'var(--accent)', color: '#fff', textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Create job →
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any errors. The `filter` on `j.infraServiceId` uses a type predicate — adjust if Drizzle types `infraServiceId` as `string | null`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add Services without backups card to dashboard"
```

---

### Task 4: New-Job Wizard — Pre-fill from URL Search Params

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/new/page.tsx`

- [ ] **Step 1: Read the current new-job page**

Read `apps/web/app/(dashboard)/jobs/new/page.tsx`. The component signature is `async function NewJobPage()` with no props.

- [ ] **Step 2: Add searchParams prop**

Change the function signature to accept search params (Next.js 15 async searchParams):

```typescript
export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; sourceType?: string; infraServiceId?: string }>
}) {
  const params = await searchParams
  const prefillName          = params.name          ?? ''
  const prefillSourceType    = params.sourceType    ?? ''
  const prefillInfraService  = params.infraServiceId ?? ''
  
  const db      = getDb()
  // ... rest of existing data fetch unchanged
```

- [ ] **Step 3: Pre-fill the Job name input**

Change the `<input name="name" ...>` to include `defaultValue`:

```tsx
<input
  name="name"
  type="text"
  defaultValue={prefillName}
  placeholder="nightly-postgres"
  style={{ ... }}
/>
```

- [ ] **Step 4: Pre-fill the Source type radio buttons**

Each radio `<input>` gets `defaultChecked`:

```tsx
<input
  type="radio"
  name="sourceType"
  value={st.value}
  defaultChecked={prefillSourceType === st.value}
  style={{ marginTop: 2 }}
/>
```

- [ ] **Step 5: Add hidden infraServiceId input**

After the schedule input (before the submit button), add:

```tsx
{prefillInfraService && (
  <input type="hidden" name="infraServiceId" value={prefillInfraService} />
)}
```

- [ ] **Step 6: Add a pre-fill banner when arriving from Infra OS**

Before the form card, add:

```tsx
{prefillInfraService && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, color: 'var(--fg-mute)',
    backgroundColor: 'var(--surf2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px', marginBottom: 16,
  }}>
    <span>Pre-filled from Infra OS service registry. Adjust fields as needed.</span>
  </div>
)}
```

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any errors. `searchParams` is `Promise<...>` in Next.js 15.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(dashboard)/jobs/new/page.tsx"
git commit -m "feat: pre-fill new-job wizard from Infra OS service URL params"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.10) | Task |
|---|---|
| Dashboard card "Services without backups" | Task 3 |
| Lists Infra OS-detected services with no backup job | Task 3 (uncoveredServices query) |
| One-click "Create recommended job" → opens wizard pre-filled | Tasks 3+4 (href with query params) |
| Full auto-provisioning deferred (light version only) | N/A — not implemented, by spec |

### Scope note

The spec says "When Infra OS is connected." Since no real Infra OS API exists in this codebase, services are registered manually via the Settings → Infra OS services page. The card only appears when at least one uncovered service exists, which matches the "when connected" intent without requiring a live API integration.

### Placeholder scan

No TBD/TODO. All code is complete. Form submission on `/jobs/new` doesn't persist to DB (there's no create-job server action yet — the form has no `action` prop in the existing code). The pre-fill is scaffolding for when that action is added; the `infraServiceId` hidden input will flow through naturally.

### Type consistency

- `infraOsServices` columns: `id: string`, `name: string`, `serviceType: string`, `host: string | null`, `description: string | null`, `createdAt: Date` — consistent across all tasks
- `backupJobs.infraServiceId` is `string | null` — consistent with the filter predicate in Task 3
- `addInfraServiceAction(formData: FormData): Promise<void>` — consistent with form `action` binding
- `removeInfraService(id: string): Promise<void>` — consistent with `.bind(null, svc.id)` in Task 2
