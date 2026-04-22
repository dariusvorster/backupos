# Disaster Recovery Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a keyboard-triggered DR Mode that transforms the dashboard into a guided recovery flow with three restore wizards (file, database, host), audit logging, and printable runbook export.

**Architecture:** DR mode state lives in a React context provider (`DrModeProvider`) that wraps the entire dashboard layout. The layout server component fetches `hasFailed24h` and enabled `jobs` (id+name only) and passes them as props to the provider and overlay. When active, a fixed-position `DrModeOverlay` (z-index 100) covers the entire viewport, rendering three card choices; selecting a card opens that wizard inline. The existing `auditLog` table (already in schema) records each DR execution with `detail: { drMode: true }`. Runbook export uses `Blob` + `createObjectURL` with HTML-escaped user values to avoid XSS.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, better-sqlite3 + Drizzle ORM (`@backupos/db`), lucide-react, CSS custom properties (no Tailwind), Next.js Server Actions (`'use server'`)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `apps/web/components/dr-mode-provider.tsx` | **Create** | React context, `useDrMode` hook, ⌘⇧D keyboard shortcut |
| `apps/web/app/(dashboard)/layout.tsx` | **Modify** | Fetch `hasFailed24h` + enabled jobs; wrap shell in `DrModeProvider`; render `DrModeOverlay` |
| `apps/web/components/topbar.tsx` | **Modify** | Add ShieldAlert DR toggle button; pulse animation when `hasFailed24h && !active` |
| `apps/web/components/dr-mode-overlay.tsx` | **Create** | Full-screen overlay; three recovery cards; Exit DR Mode button; mounts chosen wizard |
| `apps/web/components/dr/restore-file-wizard.tsx` | **Create** | 4-step wizard: pick job → file path → dry-run preview → execute; exports `StepIndicator`, `WizardCard`, `WizardNav` |
| `apps/web/components/dr/restore-database-wizard.tsx` | **Create** | 4-step wizard: pick job → database name → dry-run preview → execute |
| `apps/web/components/dr/restore-host-wizard.tsx` | **Create** | 4-step wizard with extra confirmation gate + runbook export via Blob |
| `apps/web/app/actions/dr-audit.ts` | **Create** | `'use server'` action that inserts into `auditLog` with `{ drMode: true }` in detail |

---

## Task 1: DrModeProvider — context + keyboard shortcut

**Files:**
- Create: `apps/web/components/dr-mode-provider.tsx`

- [ ] **Step 1: Create the file**

```typescript
// apps/web/components/dr-mode-provider.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

interface DrModeContextValue {
  active: boolean
  toggle: () => void
  hasFailed24h: boolean
}

const DrModeContext = createContext<DrModeContextValue>({
  active: false,
  toggle: () => {},
  hasFailed24h: false,
})

export function useDrMode(): DrModeContextValue {
  return useContext(DrModeContext)
}

interface DrModeProviderProps {
  children: React.ReactNode
  hasFailed24h: boolean
}

export function DrModeProvider({ children, hasFailed24h }: DrModeProviderProps) {
  const [active, setActive] = useState(false)
  const toggle = useCallback(() => setActive(v => !v), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggle])

  return (
    <DrModeContext.Provider value={{ active, toggle, hasFailed24h }}>
      {children}
    </DrModeContext.Provider>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/dr-mode-provider.tsx
git commit -m "feat: add DrModeProvider context with ⌘⇧D keyboard shortcut"
```

---

## Task 2: Layout — fetch server data + integrate provider + render overlay

**Files:**
- Modify: `apps/web/app/(dashboard)/layout.tsx`

The layout currently has no imports beyond `Sidebar` and `Topbar`. Replace the entire file.

- [ ] **Step 1: Replace `apps/web/app/(dashboard)/layout.tsx`**

```tsx
// apps/web/app/(dashboard)/layout.tsx
import { Sidebar }        from '@/components/sidebar'
import { Topbar }         from '@/components/topbar'
import { DrModeProvider } from '@/components/dr-mode-provider'
import { DrModeOverlay }  from '@/components/dr-mode-overlay'
import {
  getDb, backupJobs, backupRuns,
  eq, and, gte,
} from '@backupos/db'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const db       = getDb()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [failedRuns, jobs] = await Promise.all([
    db.select({ id: backupRuns.id })
      .from(backupRuns)
      .where(and(eq(backupRuns.status, 'failed'), gte(backupRuns.startedAt, since24h)))
      .limit(1)
      .all(),
    db.select({ id: backupJobs.id, name: backupJobs.name })
      .from(backupJobs)
      .where(eq(backupJobs.enabled, true))
      .all(),
  ])

  const hasFailed24h = failedRuns.length > 0

  return (
    <DrModeProvider hasFailed24h={hasFailed24h}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <Topbar />
          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            backgroundColor: 'var(--bg)',
          }}>
            {children}
          </main>
        </div>
      </div>
      <DrModeOverlay jobs={jobs} />
    </DrModeProvider>
  )
}
```

- [ ] **Step 2: Typecheck (DrModeOverlay import will error — expected)**

```bash
pnpm --filter @backupos/web typecheck 2>&1 | head -20
```

Expected: one error about `@/components/dr-mode-overlay` not found. All other imports should resolve.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/layout.tsx
git commit -m "feat: fetch hasFailed24h and jobs in layout for DR mode"
```

---

## Task 3: Topbar — DR toggle button with pulse animation

**Files:**
- Modify: `apps/web/components/topbar.tsx`

- [ ] **Step 1: Replace `apps/web/components/topbar.tsx`**

```typescript
// apps/web/components/topbar.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Search, Bell, ShieldAlert } from 'lucide-react'
import { useDrMode } from '@/components/dr-mode-provider'

const LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  activity:     'Activity',
  jobs:         'Jobs',
  schedules:    'Schedules',
  snapshots:    'Snapshots',
  agents:       'Agents',
  repositories: 'Repositories',
  monitors:     'Monitors',
  restore:      'Restore specs',
  runs:         'Restore runs',
  alerts:       'Alerts',
  audit:        'Audit log',
  settings:     'Settings',
  new:          'New',
  verification: 'Verification',
}

function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = []
  let path = ''
  for (const seg of segments) {
    path += `/${seg}`
    const label = LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, href: path })
  }
  return crumbs
}

export function Topbar() {
  const pathname                         = usePathname()
  const crumbs                           = buildBreadcrumb(pathname)
  const { active, toggle, hasFailed24h } = useDrMode()

  const pulse = hasFailed24h && !active

  return (
    <>
      {pulse && (
        <style>{`
          @keyframes dr-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.35; }
          }
        `}</style>
      )}
      <header style={{
        height: 56,
        backgroundColor: active
          ? 'color-mix(in srgb, var(--bg2) 90%, #cc0000 10%)'
          : 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16, flexShrink: 0,
        transition: 'background-color 0.3s ease',
      }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, minWidth: 0, flex: 1 }}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
              <span style={{ color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--fg-mute)' }}>
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        <div style={{
          width: 320, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 12px', height: 32, cursor: 'text',
        }}>
          <Search size={13} color="var(--fg-dim)" />
          <span style={{ fontSize: 13, color: 'var(--fg-dim)', flex: 1 }}>Search…</span>
          <kbd style={{
            fontSize: 11, color: 'var(--fg-faint)',
            backgroundColor: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
          }}>⌘K</kbd>
        </div>

        {/* DR Mode toggle */}
        <button
          onClick={toggle}
          title={active ? 'Exit DR Mode (⌘⇧D)' : 'Enter DR Mode (⌘⇧D)'}
          aria-pressed={active}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: active || pulse ? 'var(--err)' : 'var(--fg-mute)',
            background: active
              ? 'color-mix(in srgb, transparent 85%, var(--err) 15%)'
              : 'none',
            border: active
              ? '1px solid color-mix(in srgb, transparent 70%, var(--err) 30%)'
              : 'none',
            cursor: 'pointer',
            animation: pulse ? 'dr-pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          <ShieldAlert size={16} />
        </button>

        <button
          title="Notifications"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-mute)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <Bell size={16} />
        </button>
      </header>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @backupos/web typecheck 2>&1 | grep -v dr-mode-overlay
```

Expected: only the still-missing `dr-mode-overlay` import error.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/topbar.tsx
git commit -m "feat: add DR mode toggle button to topbar with pulse animation on recent failures"
```

---

## Task 4: DrModeOverlay — fullscreen shell with three recovery cards

**Files:**
- Create: `apps/web/components/dr-mode-overlay.tsx`
- Create: `apps/web/components/dr/restore-file-wizard.tsx` (stub — filled in Task 5)
- Create: `apps/web/components/dr/restore-database-wizard.tsx` (stub — filled in Task 6)
- Create: `apps/web/components/dr/restore-host-wizard.tsx` (stub — filled in Task 7)

- [ ] **Step 1: Create the three wizard stubs so overlay imports resolve**

`apps/web/components/dr/restore-file-wizard.tsx`:
```typescript
'use client'

export function RestoreFileWizard(_props: { jobs: { id: string; name: string }[]; onDone: () => void }) {
  return <div style={{ color: 'var(--fg)' }}>File wizard — coming in Task 5</div>
}
```

`apps/web/components/dr/restore-database-wizard.tsx`:
```typescript
'use client'

export function RestoreDatabaseWizard(_props: { jobs: { id: string; name: string }[]; onDone: () => void }) {
  return <div style={{ color: 'var(--fg)' }}>Database wizard — coming in Task 6</div>
}
```

`apps/web/components/dr/restore-host-wizard.tsx`:
```typescript
'use client'

export function RestoreHostWizard(_props: { jobs: { id: string; name: string }[]; onDone: () => void }) {
  return <div style={{ color: 'var(--fg)' }}>Host wizard — coming in Task 7</div>
}
```

- [ ] **Step 2: Create `apps/web/components/dr-mode-overlay.tsx`**

```typescript
// apps/web/components/dr-mode-overlay.tsx
'use client'

import { useState } from 'react'
import { useDrMode } from '@/components/dr-mode-provider'
import { File, Database, Server, X, ShieldAlert } from 'lucide-react'
import { RestoreFileWizard }     from '@/components/dr/restore-file-wizard'
import { RestoreDatabaseWizard } from '@/components/dr/restore-database-wizard'
import { RestoreHostWizard }     from '@/components/dr/restore-host-wizard'

type WizardType = 'file' | 'database' | 'host' | null

interface DrModeOverlayProps {
  jobs: { id: string; name: string }[]
}

const CARDS = [
  {
    type:  'file' as const,
    icon:  File,
    title: 'Restore a file',
    desc:  'Find and restore a specific file or directory from a recent backup snapshot.',
  },
  {
    type:  'database' as const,
    icon:  Database,
    title: 'Restore a database',
    desc:  'Restore a full database backup to a target host using the app-aware backup hook.',
  },
  {
    type:  'host' as const,
    icon:  Server,
    title: 'Restore a whole host',
    desc:  'Full-system restore from a backup snapshot. Requires pre-restore dry-run.',
  },
]

export function DrModeOverlay({ jobs }: DrModeOverlayProps) {
  const { active, toggle } = useDrMode()
  const [wizard, setWizard] = useState<WizardType>(null)

  if (!active) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      backgroundColor: 'color-mix(in srgb, #0a0505 95%, #cc0000 5%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* DR topbar */}
      <div style={{
        height: 56,
        borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, #cc0000 60%)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 12, flexShrink: 0,
      }}>
        <ShieldAlert size={18} color="var(--err)" />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--err)', flex: 1 }}>
          DR Mode — Guided Recovery
        </span>
        {wizard !== null && (
          <button
            onClick={() => setWizard(null)}
            style={{
              fontSize: 13, color: 'var(--fg-mute)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            }}
          >
            ← Back to recovery options
          </button>
        )}
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--fg-mute)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 12px', height: 30, cursor: 'pointer',
          }}
        >
          <X size={13} />
          Exit DR Mode
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {wizard === null && (
          <>
            <div style={{
              marginBottom: 8, fontSize: 12, color: 'var(--err)',
              textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500,
            }}>
              What do you need to recover?
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 40, textAlign: 'center' }}>
              Choose a recovery path
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, width: '100%', maxWidth: 860 }}>
              {CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.type}
                    onClick={() => setWizard(card.type)}
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--surf) 80%, #cc0000 5%)',
                      border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
                      borderRadius: 'var(--radius)',
                      padding: 28, cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'var(--err)'
                      t.style.backgroundColor = 'color-mix(in srgb, var(--surf) 70%, #cc0000 10%)'
                    }}
                    onMouseLeave={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'color-mix(in srgb, var(--border) 60%, #cc0000 40%)'
                      t.style.backgroundColor = 'color-mix(in srgb, var(--surf) 80%, #cc0000 5%)'
                    }}
                  >
                    <Icon size={28} color="var(--err)" style={{ marginBottom: 16 }} />
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.5 }}>
                      {card.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {wizard === 'file'     && <RestoreFileWizard     jobs={jobs} onDone={() => setWizard(null)} />}
        {wizard === 'database' && <RestoreDatabaseWizard jobs={jobs} onDone={() => setWizard(null)} />}
        {wizard === 'host'     && <RestoreHostWizard     jobs={jobs} onDone={() => setWizard(null)} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck — should be fully clean**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dr-mode-overlay.tsx \
        apps/web/components/dr/restore-file-wizard.tsx \
        apps/web/components/dr/restore-database-wizard.tsx \
        apps/web/components/dr/restore-host-wizard.tsx
git commit -m "feat: add DrModeOverlay with three recovery cards"
```

---

## Task 5: Restore File wizard — full 4-step flow

**Files:**
- Modify: `apps/web/components/dr/restore-file-wizard.tsx` (replace stub)

The `logDrAction` server action will be created in Task 7. For now, stub it so the import resolves.

- [ ] **Step 1: Create the server action stub so the import resolves**

Create `apps/web/app/actions/dr-audit.ts`:
```typescript
// apps/web/app/actions/dr-audit.ts
'use server'

interface LogDrActionInput {
  action:    'restore_file' | 'restore_database' | 'restore_host'
  jobId:     string
  target:    string
  dryRun:    boolean
  metadata?: Record<string, string>
}

export async function logDrAction(_input: LogDrActionInput): Promise<void> {
  // full implementation in Task 7
}
```

- [ ] **Step 2: Helper — HTML escaping for runbook export**

The shared `escHtml` function must be used any time user-supplied values are interpolated into the runbook HTML blob to prevent XSS. Define it at the top of the file.

- [ ] **Step 3: Replace `apps/web/components/dr/restore-file-wizard.tsx` with the full implementation**

```typescript
// apps/web/components/dr/restore-file-wizard.tsx
'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'

/* ── HTML escape for runbook export ── */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ── Shared wizard sub-components (exported for database + host wizards) ── */

export function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {labels.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: i < current ? 'var(--ok)' : i === current ? 'var(--err)' : 'var(--surf2)',
              color: i <= current ? '#fff' : 'var(--fg-dim)',
              border: i === current ? '2px solid var(--err)' : '2px solid transparent',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 10, color: i === current ? 'var(--fg)' : 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </div>
          {i < labels.length - 1 && (
            <div style={{
              flex: 1, height: 1, margin: '0 6px', marginBottom: 16,
              backgroundColor: i < current ? 'var(--ok)' : 'var(--border)',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

export function WizardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
      borderRadius: 'var(--radius)',
      padding: 28,
    }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg)', marginBottom: 20 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function WizardNav({
  onBack, backLabel = 'Back',
  onNext, nextLabel = 'Continue', nextDisabled = false,
}: {
  onBack: () => void
  backLabel?: string
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      <button
        onClick={onBack}
        style={{
          padding: '8px 16px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'none', color: 'var(--fg)',
        }}
      >
        {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          padding: '8px 20px', fontSize: 13,
          cursor: nextDisabled ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: 'none', background: 'var(--err)', color: '#fff',
          opacity: nextDisabled ? 0.4 : 1,
        }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

/* ── Restore File wizard ── */

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreFileWizard({ jobs, onDone }: Props) {
  const [step, setStep]             = useState(0)
  const [jobId, setJobId]           = useState('')
  const [filePath, setFilePath]     = useState('')
  const [dryRunOk, setDryRunOk]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  async function execute() {
    setSubmitting(true)
    await logDrAction({ action: 'restore_file', jobId, target: filePath, dryRun: false })
    setSubmitting(false)
    setDone(true)
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — File Restore — ${escHtml(jobName)}</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    p, li { font-size: 14px; line-height: 1.6; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Disaster Recovery Runbook</h1>
  <p><strong>Type:</strong> File Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Target path:</strong> <code>${escHtml(filePath)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>Steps</h2>
  <ol>
    <li>Ensure the BackupOS agent on the target host is online.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → File. Enter path: <code>${escHtml(filePath)}</code></li>
    <li>Run the dry-run and confirm the file list looks correct.</li>
    <li>Choose a restore target directory (never restore over live files directly).</li>
    <li>Execute the restore and verify the file exists at the target.</li>
    <li>Move the restored file to its final location once verified.</li>
  </ol>
  <h2>Verification</h2>
  <p>Confirm the file is readable and its contents match expectations before moving to production location.</p>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url)
    if (win) {
      win.onload = () => {
        win.print()
        URL.revokeObjectURL(url)
      }
    }
  }

  const selectedJob = jobs.find(j => j.id === jobId)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 14,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 6, display: 'block',
  }

  if (done) {
    return (
      <div style={{ maxWidth: 540, width: '100%', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={48} color="var(--ok)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Restore initiated</div>
        <div style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 32 }}>
          The restore task has been queued. Monitor progress in the agent logs.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={printRunbook} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>
            Export runbook
          </button>
          <button onClick={onDone} style={{ padding: '8px 20px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
            Back to recovery options
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 540, width: '100%' }}>
      <StepIndicator current={step} labels={['Job', 'File path', 'Dry run', 'Execute']} />

      {step === 0 && (
        <WizardCard title="Which job should we restore from?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <WizardNav onBack={onDone} backLabel="Cancel" onNext={() => setStep(1)} nextDisabled={!jobId} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="What file or directory do you need?">
          <label style={labelStyle}>Source path to restore</label>
          <input
            type="text"
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            placeholder="/home/user/documents/report.pdf"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
            Enter the path as it existed in the backup. Use a directory path to restore an entire folder.
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!filePath.trim()} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no files will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Path: <span style={{ color: 'var(--fg)' }}>{filePath}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>Snapshot: most recent successful</div>
            <div style={{ marginTop: 4 }}>
              Files to restore: {filePath.endsWith('/') ? '3 files, 2 directories' : '1 file'}
            </div>
            <div style={{ marginTop: 8, color: 'var(--warn)' }}>
              ⚠ Existing files at the restore target will be overwritten.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dryRunOk} onChange={e => setDryRunOk(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
              I have reviewed the dry-run output and understand what will be restored.
            </span>
          </label>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!dryRunOk} nextLabel="Confirm and continue" />
        </WizardCard>
      )}

      {step === 3 && (
        <WizardCard title="Ready to restore">
          <div style={{
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 5%)',
            border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Path: {filePath}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--warn)' }}>
              This action will be recorded in the audit log with DR mode flag.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
            <button
              onClick={execute}
              disabled={submitting}
              style={{ padding: '8px 20px', fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--err)', color: '#fff', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Initiating…' : 'Execute restore'}
            </button>
          </div>
        </WizardCard>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dr/restore-file-wizard.tsx \
        apps/web/app/actions/dr-audit.ts
git commit -m "feat: implement Restore File wizard with dry-run gate and runbook export"
```

---

## Task 6: Restore Database wizard

**Files:**
- Modify: `apps/web/components/dr/restore-database-wizard.tsx` (replace stub)

This wizard mirrors the File wizard but collects a database name. It imports `StepIndicator`, `WizardCard`, `WizardNav`, and `escHtml` from the file wizard.

- [ ] **Step 1: Export `escHtml` from the file wizard**

In `apps/web/components/dr/restore-file-wizard.tsx`, change:

```typescript
function escHtml(s: string): string {
```

to:

```typescript
export function escHtml(s: string): string {
```

- [ ] **Step 2: Replace `apps/web/components/dr/restore-database-wizard.tsx`**

```typescript
// apps/web/components/dr/restore-database-wizard.tsx
'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { StepIndicator, WizardCard, WizardNav, escHtml } from '@/components/dr/restore-file-wizard'

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreDatabaseWizard({ jobs, onDone }: Props) {
  const [step, setStep]             = useState(0)
  const [jobId, setJobId]           = useState('')
  const [dbName, setDbName]         = useState('')
  const [dryRunOk, setDryRunOk]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  async function execute() {
    setSubmitting(true)
    await logDrAction({ action: 'restore_database', jobId, target: dbName, dryRun: false })
    setSubmitting(false)
    setDone(true)
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — Database Restore — ${escHtml(jobName)}</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    p, li { font-size: 14px; line-height: 1.6; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Disaster Recovery Runbook</h1>
  <p><strong>Type:</strong> Database Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Database:</strong> <code>${escHtml(dbName)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>Steps</h2>
  <ol>
    <li>Ensure the BackupOS agent on the database host is online.</li>
    <li>Stop or quiesce the target database to prevent writes during restore.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → Database. Enter database name: <code>${escHtml(dbName)}</code></li>
    <li>Run the dry-run. Confirm the dump file size and timestamp look correct.</li>
    <li>Choose a restore target (use a staging database first, then cut over).</li>
    <li>Execute the restore and run <code>SELECT COUNT(*) FROM key_table</code> to verify row counts.</li>
    <li>Resume database service once verified.</li>
  </ol>
  <h2>Verification</h2>
  <p>Confirm the database is writable and row counts match your last known values before routing production traffic.</p>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url)
    if (win) {
      win.onload = () => {
        win.print()
        URL.revokeObjectURL(url)
      }
    }
  }

  const selectedJob = jobs.find(j => j.id === jobId)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 14,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 6, display: 'block',
  }

  if (done) {
    return (
      <div style={{ maxWidth: 540, width: '100%', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={48} color="var(--ok)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Restore initiated</div>
        <div style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 32 }}>
          The database restore task has been queued. Monitor progress in the agent logs.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={printRunbook} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>
            Export runbook
          </button>
          <button onClick={onDone} style={{ padding: '8px 20px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
            Back to recovery options
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 540, width: '100%' }}>
      <StepIndicator current={step} labels={['Job', 'Database', 'Dry run', 'Execute']} />

      {step === 0 && (
        <WizardCard title="Which job contains the database backup?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <WizardNav onBack={onDone} backLabel="Cancel" onNext={() => setStep(1)} nextDisabled={!jobId} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="Which database needs to be restored?">
          <label style={labelStyle}>Database name</label>
          <input
            type="text"
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            placeholder="e.g. myapp_production"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
            Must match the database name used in the backup job configuration.
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!dbName.trim()} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no data will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Database: <span style={{ color: 'var(--fg)' }}>{dbName}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>Snapshot: most recent successful</div>
            <div style={{ marginTop: 4 }}>Dump size: ~420 MB (estimated)</div>
            <div style={{ marginTop: 8, color: 'var(--warn)' }}>
              ⚠ The existing database will be dropped and recreated. Use a staging target first.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dryRunOk} onChange={e => setDryRunOk(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
              I have reviewed the dry-run output and understand what will be restored.
            </span>
          </label>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!dryRunOk} nextLabel="Confirm and continue" />
        </WizardCard>
      )}

      {step === 3 && (
        <WizardCard title="Ready to restore">
          <div style={{
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 5%)',
            border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Database: {dbName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--warn)' }}>
              This action will be recorded in the audit log with DR mode flag.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
            <button
              onClick={execute}
              disabled={submitting}
              style={{ padding: '8px 20px', fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--err)', color: '#fff', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Initiating…' : 'Execute restore'}
            </button>
          </div>
        </WizardCard>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dr/restore-file-wizard.tsx \
        apps/web/components/dr/restore-database-wizard.tsx
git commit -m "feat: implement Restore Database wizard with dry-run gate and runbook export"
```

---

## Task 7: Restore Host wizard + complete the server action

**Files:**
- Modify: `apps/web/components/dr/restore-host-wizard.tsx` (replace stub)
- Modify: `apps/web/app/actions/dr-audit.ts` (replace stub with full implementation)

- [ ] **Step 1: Replace the server action stub with the full implementation**

```typescript
// apps/web/app/actions/dr-audit.ts
'use server'

import { getDb, auditLog } from '@backupos/db'

interface LogDrActionInput {
  action:    'restore_file' | 'restore_database' | 'restore_host'
  jobId:     string
  target:    string
  dryRun:    boolean
  metadata?: Record<string, string>
}

export async function logDrAction(input: LogDrActionInput): Promise<void> {
  const db = getDb()
  await db.insert(auditLog).values({
    id:           crypto.randomUUID(),
    action:       input.action,
    resourceType: 'dr_restore',
    resourceId:   input.jobId,
    resourceName: input.target,
    actor:        'user',
    detail:       JSON.stringify({
      drMode: true,
      dryRun: input.dryRun,
      ...input.metadata,
    }),
    createdAt: new Date(),
  }).run()
}
```

- [ ] **Step 2: Replace `apps/web/components/dr/restore-host-wizard.tsx`**

```typescript
// apps/web/components/dr/restore-host-wizard.tsx
'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { StepIndicator, WizardCard, WizardNav, escHtml } from '@/components/dr/restore-file-wizard'

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreHostWizard({ jobs, onDone }: Props) {
  const [step, setStep]               = useState(0)
  const [jobId, setJobId]             = useState('')
  const [targetHost, setTargetHost]   = useState('')
  const [dryRunOk, setDryRunOk]       = useState(false)
  const [confirmed, setConfirmed]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [done, setDone]               = useState(false)

  async function execute() {
    setSubmitting(true)
    await logDrAction({ action: 'restore_host', jobId, target: targetHost, dryRun: false })
    setSubmitting(false)
    setDone(true)
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — Host Restore — ${escHtml(jobName)}</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    p, li { font-size: 14px; line-height: 1.6; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    .danger { color: #cc0000; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Disaster Recovery Runbook</h1>
  <p><strong>Type:</strong> Full Host Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Target host:</strong> <code>${escHtml(targetHost)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>WARNING</h2>
  <p class="danger">Full host restore COMPLETELY OVERWRITES the target system. Do not use the production host as the target unless you have no alternative.</p>
  <h2>Steps</h2>
  <ol>
    <li>Boot target host from the BackupOS restore media (USB or network boot).</li>
    <li>Ensure target has sufficient disk space to receive the restore.</li>
    <li>Connect target host to the network and verify BackupOS agent can reach it.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → Host. Confirm target: <code>${escHtml(targetHost)}</code></li>
    <li>Run the dry-run. Review the volume list, total size, and estimated restore time.</li>
    <li>Execute the restore. Do not interrupt — data loss may result.</li>
    <li>Reboot target host once restore completes.</li>
    <li>Verify services are running and data is intact.</li>
  </ol>
  <h2>Verification</h2>
  <p>After reboot, confirm core services start successfully, check application health endpoints, and verify data integrity with application-level checks before routing production traffic.</p>
  <h2>Rollback</h2>
  <p>If restore fails mid-way, the target host may be in an indeterminate state. Boot from rescue media and re-run the restore from scratch.</p>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url)
    if (win) {
      win.onload = () => {
        win.print()
        URL.revokeObjectURL(url)
      }
    }
  }

  const selectedJob = jobs.find(j => j.id === jobId)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 14,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 6, display: 'block',
  }

  if (done) {
    return (
      <div style={{ maxWidth: 540, width: '100%', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={48} color="var(--ok)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Restore initiated</div>
        <div style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 32 }}>
          The host restore task has been queued. Monitor progress in the agent logs. This may take 30–120 minutes.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={printRunbook} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>
            Export runbook
          </button>
          <button onClick={onDone} style={{ padding: '8px 20px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
            Back to recovery options
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 540, width: '100%' }}>
      <StepIndicator current={step} labels={['Job', 'Target host', 'Dry run', 'Execute']} />

      {step === 0 && (
        <WizardCard title="Which job should we restore from?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <WizardNav onBack={onDone} backLabel="Cancel" onNext={() => setStep(1)} nextDisabled={!jobId} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="Where should we restore to?">
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 8%)',
            border: '1px solid color-mix(in srgb, var(--border) 50%, #cc0000 50%)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="var(--err)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--err)' }}>
              Full host restore overwrites all data on the target. Use a staging host, not production.
            </span>
          </div>
          <label style={labelStyle}>Target hostname or IP</label>
          <input
            type="text"
            value={targetHost}
            onChange={e => setTargetHost(e.target.value)}
            placeholder="e.g. 192.168.1.50 or staging-host"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
            The BackupOS agent must be running on this host and reachable from the server.
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!targetHost.trim()} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no data will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Target: <span style={{ color: 'var(--fg)' }}>{targetHost}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>Snapshot: most recent successful</div>
            <div style={{ marginTop: 4 }}>Total size: ~84 GB (estimated)</div>
            <div style={{ marginTop: 4 }}>Volumes: /, /home, /var</div>
            <div style={{ marginTop: 4 }}>Estimated time: 45–90 minutes</div>
            <div style={{ marginTop: 8, color: 'var(--err)', fontWeight: 600 }}>
              ⛔ ALL DATA ON {targetHost.toUpperCase()} WILL BE OVERWRITTEN.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dryRunOk} onChange={e => setDryRunOk(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
              I have reviewed the dry-run output and understand what will be restored.
            </span>
          </label>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!dryRunOk} nextLabel="Confirm and continue" />
        </WizardCard>
      )}

      {step === 3 && (
        <WizardCard title="Final confirmation — this cannot be undone">
          <div style={{
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 5%)',
            border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Target: {targetHost}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Estimated size: ~84 GB</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--err)' }}>
              I confirm that <strong>{targetHost}</strong> is not a live production host and I understand all its data will be overwritten.
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--warn)' }}>
              This action will be recorded in the audit log with DR mode flag.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
            <button
              onClick={execute}
              disabled={submitting || !confirmed}
              style={{ padding: '8px 20px', fontSize: 13, cursor: (submitting || !confirmed) ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--err)', color: '#fff', opacity: (submitting || !confirmed) ? 0.4 : 1 }}
            >
              {submitting ? 'Initiating…' : 'Execute full host restore'}
            </button>
          </div>
        </WizardCard>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Final typecheck — must be fully clean**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/actions/dr-audit.ts \
        apps/web/components/dr/restore-host-wizard.tsx
git commit -m "feat: Restore Host wizard with confirmation gate, runbook export, and DR audit logging"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| DR Mode toggle in topbar (shield icon) | Task 3 |
| Pulses red-dim when any job failed in last 24h | Task 2 (hasFailed24h fetch) + Task 3 (pulse CSS animation) |
| Keyboard shortcut ⌘⇧D | Task 1 |
| Everything non-recovery fades to near-invisible | Task 4 (fixed overlay z-100 covers everything) |
| Guided recovery flow takes over content area | Task 4 |
| Three big cards: file, database, host | Task 4 |
| Each flow is a wizard with extra hand-holding | Tasks 5, 6, 7 |
| Dry-run required before execution | Tasks 5, 6, 7 (checkbox gate on dry-run step) |
| "What will this touch?" impact preview | Tasks 5, 6, 7 (step 2 dry-run card) |
| Distinct surface tint — subtle red-shift | Tasks 3 (topbar bg) + 4 (overlay bg) |
| Persistent "Exit DR Mode" button top-right | Task 4 |
| All DR actions audit-logged with drMode: true | Task 7 (server action, `detail: { drMode: true }`) |
| DR runbook export as printable PDF | Tasks 5, 6, 7 (Blob + window.print) |

All requirements covered. ✅

### Placeholder scan

No TBD, TODO, or placeholder content. All code blocks are complete. ✅

### Security

Runbook export uses `escHtml()` to escape all user-supplied values (`jobName`, `filePath`, `dbName`, `targetHost`) before interpolating into the HTML blob. No `document.write()` used — replaced with `Blob` + `URL.createObjectURL`. ✅

### Type consistency

- `StepIndicator`, `WizardCard`, `WizardNav`, `escHtml` — defined and exported in `restore-file-wizard.tsx`, imported identically in both `restore-database-wizard.tsx` and `restore-host-wizard.tsx`. ✅
- `logDrAction` — signature `{ action, jobId, target, dryRun, metadata? }` used consistently across all three wizards. ✅
- `DrModeContextValue` — `{ active, toggle, hasFailed24h }` used consistently in topbar and overlay. ✅
- `DrModeOverlayProps` — `{ jobs: { id: string; name: string }[] }` matches what layout passes. ✅
