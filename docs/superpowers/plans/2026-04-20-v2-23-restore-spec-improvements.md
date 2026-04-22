# Restore Spec Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-made spec template library with a "fork to customise" action, display spec variable tokens in the detail view, and add a stub "Step marketplace" button.

**Architecture:** No schema changes. The template library is a hardcoded constant in the restore page — three YAML templates rendered as cards with a `forkSpec` server action that inserts a new `restoreSpecs` row from the template. The spec detail page scans `yamlContent` for `${...}` tokens and renders a callout listing them. The marketplace stub is a disabled button on the restore list page.

**Tech Stack:** Next.js 15 App Router (server + client actions), Drizzle ORM, SQLite, CSS vars.

---

## File Map

| File | Action |
|---|---|
| `apps/web/app/actions/restore.ts` | Create — `forkSpec` server action |
| `apps/web/app/(dashboard)/restore/page.tsx` | Modify — add template library section + marketplace stub |
| `apps/web/app/(dashboard)/restore/[id]/page.tsx` | Modify — variable tokens callout in spec detail |

---

### Task 1: `forkSpec` server action

**Files:**
- Create: `apps/web/app/actions/restore.ts`

- [ ] **Step 1: Check if `apps/web/app/actions/restore.ts` already exists**

```bash
ls /Users/dariusvorster/Projects/backupos/apps/web/app/actions/
```

If it exists, read it before editing. If not, create it fresh.

- [ ] **Step 2: Create `apps/web/app/actions/restore.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { getDb, restoreSpecs } from '@backupos/db'

export async function forkSpec(name: string, yamlContent: string): Promise<void> {
  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(restoreSpecs).values({
    id,
    name:             `${name} (copy)`,
    description:      'Forked from template library.',
    yamlContent,
    createdAt:        new Date(),
    validationStatus: null,
  })
  revalidatePath('/restore')
  redirect(`/restore/${id}`)
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
git add apps/web/app/actions/restore.ts
git commit -m "feat: forkSpec server action for restore template library"
```

---

### Task 2: Template library section + marketplace stub on restore list page

**Files:**
- Modify: `apps/web/app/(dashboard)/restore/page.tsx`

The three templates are defined as a constant in the file. Each card shows name, description, YAML preview, and a "Fork" form button. The marketplace stub is a disabled button in the header.

- [ ] **Step 1: Read `apps/web/app/(dashboard)/restore/page.tsx`** (required before editing)

- [ ] **Step 2: Replace with the updated version**

```typescript
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { getDb, restoreSpecs, restoreRuns, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { forkSpec } from '@/app/actions/restore'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function validationBadge(s: string | null): BadgeStatus {
  if (s === 'valid')   return 'healthy'
  if (s === 'invalid') return 'error'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const TEMPLATES: { name: string; description: string; yaml: string }[] = [
  {
    name: 'Postgres DR',
    description: 'Full PostgreSQL database disaster recovery.',
    yaml: `name: Postgres DR
steps:
  - name: Restore snapshot to staging area
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target /tmp/restore-\${DATE}
  - name: Import dump into Postgres
    type: shell
    command: psql -U postgres -h \${HOST} -d mydb < /tmp/restore-\${DATE}/dump.sql
  - name: Verify row counts
    type: shell
    command: psql -U postgres -h \${HOST} -c "SELECT count(*) FROM users;"
`,
  },
  {
    name: 'Docker stack DR',
    description: 'Bring up a Docker Compose stack from a backup snapshot.',
    yaml: `name: Docker stack DR
steps:
  - name: Restore snapshot
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target /tmp/stack-\${DATE}
  - name: Stop running stack
    type: shell
    command: docker compose -f /opt/myapp/docker-compose.yml down
  - name: Overwrite volumes
    type: shell
    command: cp -r /tmp/stack-\${DATE}/volumes /opt/myapp/volumes
  - name: Start stack
    type: shell
    command: docker compose -f /opt/myapp/docker-compose.yml up -d
`,
  },
  {
    name: 'Full-host DR',
    description: 'Bare-metal full-host restore to a new machine.',
    yaml: `name: Full-host DR
steps:
  - name: Restore snapshot to root
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target / --host \${HOST}
  - name: Regenerate initramfs
    type: shell
    command: update-initramfs -u
  - name: Update GRUB
    type: shell
    command: update-grub
`,
  },
]

export default async function RestorePage() {
  const db = getDb()
  const [specs, recentRuns] = await Promise.all([
    db.select().from(restoreSpecs).all(),
    db.select().from(restoreRuns).orderBy(desc(restoreRuns.startedAt)).limit(10).all(),
  ])

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Restore</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled
            title="Coming soon"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg-dim)',
              cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            Step marketplace
          </button>
          <Link href="/restore/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              <RotateCcw size={14} />
              New restore spec
            </Button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* Specs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Restore specs
          </div>
          {specs.length === 0 ? (
            <EmptyState
              type="inline"
              headline="No restore specs yet."
              primaryAction={{ label: 'Create one', href: '/restore/new' }}
            />
          ) : (
            specs.map(spec => (
              <div key={spec.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Link href={`/restore/${spec.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                    {spec.name}
                  </Link>
                </div>
                <Badge
                  status={validationBadge(spec.validationStatus)}
                  label={spec.validationStatus ?? 'Untested'}
                />
              </div>
            ))
          )}
        </div>

        {/* Recent runs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Recent restore runs
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState type="inline" headline="No restore runs yet" />
          ) : (
            recentRuns.map(run => (
              <div key={run.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(run.startedAt)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{run.trigger ?? 'manual'}</div>
                </div>
                <Badge status={run.status as BadgeStatus} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Template library */}
      <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Template library</div>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16 }}>
        Pre-built restore specs for common scenarios. Fork one to get started.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {TEMPLATES.map(t => {
          const action = forkSpec.bind(null, t.name, t.yaml)
          return (
            <div
              key={t.name}
              style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)', flex: 1 }}>{t.description}</div>
              <pre style={{
                fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)',
                padding: '8px 10px', margin: 0,
                overflow: 'hidden', maxHeight: 80, whiteSpace: 'pre-wrap',
              }}>
                {t.yaml.split('\n').slice(0, 4).join('\n')}…
              </pre>
              <form action={action}>
                <button
                  type="submit"
                  style={{
                    width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 500,
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'var(--surf2)', color: 'var(--fg-mute)',
                    cursor: 'pointer',
                  }}
                >
                  Fork →
                </button>
              </form>
            </div>
          )
        })}
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
git add "apps/web/app/(dashboard)/restore/page.tsx"
git commit -m "feat: restore template library + marketplace stub on restore page"
```

---

### Task 3: Variable tokens callout on spec detail page

**Files:**
- Modify: `apps/web/app/(dashboard)/restore/[id]/page.tsx`

Extract all `${...}` tokens from `spec.yamlContent` and display them as a callout above the YAML block.

- [ ] **Step 1: Read `apps/web/app/(dashboard)/restore/[id]/page.tsx`** (required before editing)

- [ ] **Step 2: Replace with the updated version**

```typescript
import type { ComponentProps } from 'react'
import { getDb, restoreSpecs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function validationBadge(s: string | null): BadgeStatus {
  if (s === 'valid')   return 'healthy'
  if (s === 'invalid') return 'error'
  return 'idle'
}

function extractVars(yaml: string): string[] {
  const matches = yaml.match(/\$\{[A-Z_]+\}/g) ?? []
  return [...new Set(matches)].sort()
}

export default async function RestoreSpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)
  if (!spec) notFound()

  const vars = extractVars(spec.yamlContent)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/restore" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Restore</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{spec.name}</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/restore/${id}/runs`} style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="md">Run history</Button>
            </Link>
            <Button variant="primary" size="md">Run now</Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <Badge status={validationBadge(spec.validationStatus)} label={spec.validationStatus ?? 'untested'} />
        {spec.description && <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>{spec.description}</span>}
      </div>

      {vars.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 16,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0, paddingTop: 2 }}>Variables</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {vars.map(v => (
              <span
                key={v}
                style={{
                  display: 'inline-block', padding: '2px 8px', fontSize: 11,
                  fontFamily: 'var(--font-mono)', borderRadius: 4,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  color: 'var(--accent)',
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 20,
      }}>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          YAML
        </div>
        <pre style={{
          margin: 0, fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {spec.yamlContent}
        </pre>
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
git add "apps/web/app/(dashboard)/restore/[id]/page.tsx"
git commit -m "feat: variable tokens callout on restore spec detail page"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Spec library — pre-made example specs (Postgres DR, Docker stack DR, full-host DR) | Task 2 (`TEMPLATES` constant + cards) |
| Fork-to-customise pattern | Task 1 (`forkSpec`) + Task 2 (Fork button form) |
| Spec variables `${SNAPSHOT_ID}`, `${DATE}`, `${HOST}` shown at runtime | Task 3 (`extractVars` + callout) |
| Step marketplace — UI stub only for V1 | Task 2 (disabled "Step marketplace" button) |

### Placeholder scan

No TBDs, TODOs, or stubs with missing code. The marketplace button is intentionally disabled — the spec says "UI stub only for V1."

### Type consistency

- `forkSpec(name: string, yamlContent: string)` — called via `.bind(null, t.name, t.yaml)` in the form action. Both args are strings — consistent.
- `restoreSpecs.insert.values({...})` — all required fields provided: `id`, `name`, `yamlContent`, `createdAt`. Optional fields (`description`, `jobId`, `repositoryId`, `lastValidatedAt`, `validationStatus`) are nullable and correctly omitted or set to `null`.
- `extractVars` returns `string[]` — `vars.map(v => ...)` and `vars.length > 0` both consistent.
- `${...}` regex `\$\{[A-Z_]+\}` matches only uppercase variable names (the spec variables `SNAPSHOT_ID`, `DATE`, `HOST` all match).
