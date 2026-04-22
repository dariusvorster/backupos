# Global Search (⌘K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full-screen ⌘K command palette with fuzzy search across jobs, repositories, agents, snapshots, restore specs, monitors, alert rules, and audit events, plus static command shortcuts and persistent recent searches.

**Architecture:** A `CommandPaletteProvider` context tracks open state and exposes `openPalette()`. A server action `searchAll(query)` queries SQLite with `LIKE` across all entity tables. The `CommandPalette` client component handles debounced search, keyboard navigation (↑↓↵Esc), localStorage recent searches, and static command results. The layout injects both provider and palette; the topbar search bar calls `openPalette()` on click.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, React 19 `useTransition`, CSS custom properties, lucide-react icons, localStorage for recent searches.

---

## File Map

| File | Action |
|---|---|
| `apps/web/lib/search.ts` | Create — `searchAll(query)` queries 8 tables, returns typed `SearchResult[]` |
| `apps/web/app/actions/search.ts` | Create — server action wrapping `searchAll` |
| `apps/web/components/command-palette-provider.tsx` | Create — context: `open`, `openPalette()`, `closePalette()` |
| `apps/web/components/command-palette.tsx` | Create — full overlay UI: input, grouped results, keyboard nav, recent searches |
| `apps/web/app/(dashboard)/layout.tsx` | Modify — add `CommandPaletteProvider` + `<CommandPalette />` |
| `apps/web/components/topbar.tsx` | Modify — wire search bar `onClick` to `openPalette()` |

---

### Task 1: Search Utility Library + Server Action

**Files:**
- Create: `apps/web/lib/search.ts`
- Create: `apps/web/app/actions/search.ts`

- [ ] **Step 1: Create `apps/web/lib/search.ts`**

```typescript
import { getDb, backupJobs, repositories, agents, snapshots, restoreSpecs, alertRules, auditLog, backupMonitors } from '@backupos/db'
import { like, or } from 'drizzle-orm'

export type ResultType =
  | 'job'
  | 'repository'
  | 'agent'
  | 'snapshot'
  | 'restoreSpec'
  | 'monitor'
  | 'alertRule'
  | 'auditEvent'

export interface SearchResult {
  type:     ResultType
  id:       string
  label:    string
  sublabel: string
  url:      string
}

export async function searchAll(query: string): Promise<SearchResult[]> {
  if (query.trim().length < 2) return []
  const q   = `%${query.trim()}%`
  const db  = getDb()
  const results: SearchResult[] = []

  const [jobs, repos, agentRows, snaps, specs, monitors, alerts, events] = await Promise.all([
    db.select({ id: backupJobs.id, name: backupJobs.name, sourceType: backupJobs.sourceType })
      .from(backupJobs)
      .where(or(like(backupJobs.name, q), like(backupJobs.sourceType, q)))
      .limit(5).all(),

    db.select({ id: repositories.id, name: repositories.name, backend: repositories.backend })
      .from(repositories)
      .where(or(like(repositories.name, q), like(repositories.backend, q)))
      .limit(5).all(),

    db.select({ id: agents.id, name: agents.name, hostname: agents.hostname })
      .from(agents)
      .where(or(like(agents.name, q), like(agents.hostname, q)))
      .limit(5).all(),

    db.select({ id: snapshots.id, hostname: snapshots.hostname, repositoryId: snapshots.repositoryId })
      .from(snapshots)
      .where(like(snapshots.hostname, q))
      .limit(5).all(),

    db.select({ id: restoreSpecs.id, name: restoreSpecs.name, description: restoreSpecs.description })
      .from(restoreSpecs)
      .where(or(like(restoreSpecs.name, q), like(restoreSpecs.description, q)))
      .limit(5).all(),

    db.select({ id: backupMonitors.id, name: backupMonitors.name })
      .from(backupMonitors)
      .where(like(backupMonitors.name, q))
      .limit(5).all(),

    db.select({ id: alertRules.id, name: alertRules.name, type: alertRules.type })
      .from(alertRules)
      .where(or(like(alertRules.name, q), like(alertRules.type, q)))
      .limit(5).all(),

    db.select({ id: auditLog.id, action: auditLog.action, resourceType: auditLog.resourceType, resourceName: auditLog.resourceName })
      .from(auditLog)
      .where(or(like(auditLog.action, q), like(auditLog.resourceName, q)))
      .limit(5).all(),
  ])

  for (const j of jobs)     results.push({ type: 'job',         id: j.id,  label: j.name,             sublabel: `Job · ${j.sourceType ?? ''}`,         url: `/jobs/${j.id}` })
  for (const r of repos)    results.push({ type: 'repository',  id: r.id,  label: r.name,             sublabel: `Repository · ${r.backend ?? ''}`,      url: `/repositories/${r.id}` })
  for (const a of agentRows) results.push({ type: 'agent',      id: a.id,  label: a.name,             sublabel: `Agent · ${a.hostname ?? ''}`,           url: `/agents/${a.id}` })
  for (const s of snaps)    results.push({ type: 'snapshot',    id: s.id,  label: s.id.slice(0, 12),  sublabel: `Snapshot · ${s.hostname ?? ''}`,         url: `/snapshots` })
  for (const s of specs)    results.push({ type: 'restoreSpec', id: s.id,  label: s.name,             sublabel: `Restore spec · ${s.description ?? ''}`, url: `/restore/${s.id}` })
  for (const m of monitors) results.push({ type: 'monitor',     id: m.id,  label: m.name,             sublabel: 'Monitor',                               url: `/monitors/${m.id}` })
  for (const a of alerts)   results.push({ type: 'alertRule',   id: a.id,  label: a.name,             sublabel: `Alert rule · ${a.type ?? ''}`,           url: `/alerts/${a.id}` })
  for (const e of events)   results.push({ type: 'auditEvent',  id: String(e.id), label: e.action,   sublabel: `${e.resourceType} · ${e.resourceName ?? ''}`, url: `/audit` })

  return results
}
```

- [ ] **Step 2: Create `apps/web/app/actions/search.ts`**

```typescript
'use server'

import { searchAll } from '@/lib/search'
import type { SearchResult } from '@/lib/search'

export async function search(query: string): Promise<SearchResult[]> {
  return searchAll(query)
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

Expected: 0 errors. If you see "no such export" errors for table names, read `packages/db/src/index.ts` to confirm the export names and fix accordingly.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/search.ts apps/web/app/actions/search.ts
git commit -m "feat: add searchAll utility and search server action"
```

---

### Task 2: CommandPaletteProvider Context

**Files:**
- Create: `apps/web/components/command-palette-provider.tsx`

- [ ] **Step 1: Create `apps/web/components/command-palette-provider.tsx`**

```typescript
'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface CommandPaletteContextValue {
  open:          boolean
  openPalette:   () => void
  closePalette:  () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openPalette  = useCallback(() => setOpen(true),  [])
  const closePalette = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ open, openPalette, closePalette }}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  return ctx
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/command-palette-provider.tsx
git commit -m "feat: add CommandPaletteProvider context with ⌘K keyboard shortcut"
```

---

### Task 3: CommandPalette Overlay Component

**Files:**
- Create: `apps/web/components/command-palette.tsx`

- [ ] **Step 1: Create `apps/web/components/command-palette.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandPalette } from '@/components/command-palette-provider'
import { search } from '@/app/actions/search'
import type { SearchResult, ResultType } from '@/lib/search'
import {
  Search, X, Briefcase, Database, Cpu, Archive,
  FileText, Activity, Bell, Clock, Plus, Settings,
} from 'lucide-react'

// ─── Static commands ───────────────────────────────────────────────────────────

interface CommandItem {
  id:      string
  label:   string
  sublabel: string
  url:     string
  isCommand: true
}

const COMMANDS: CommandItem[] = [
  { id: 'cmd-new-job',       label: 'Create job',        sublabel: 'New backup job',           url: '/jobs/new',          isCommand: true },
  { id: 'cmd-new-agent',     label: 'Enrol agent',       sublabel: 'Connect a new agent',      url: '/agents/new',        isCommand: true },
  { id: 'cmd-new-repo',      label: 'Add repository',    sublabel: 'New backup target',        url: '/repositories/new',  isCommand: true },
  { id: 'cmd-bandwidth',     label: 'Bandwidth settings', sublabel: 'Manage rate limits',      url: '/settings/bandwidth', isCommand: true },
  { id: 'cmd-settings',      label: 'Settings',          sublabel: 'App configuration',        url: '/settings',          isCommand: true },
]

// ─── Icon map ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ResultType, React.FC<{ size: number; color: string }>> = {
  job:         Briefcase,
  repository:  Database,
  agent:       Cpu,
  snapshot:    Archive,
  restoreSpec: FileText,
  monitor:     Activity,
  alertRule:   Bell,
  auditEvent:  Clock,
}

const TYPE_LABEL: Record<ResultType, string> = {
  job:         'Jobs',
  repository:  'Repositories',
  agent:       'Agents',
  snapshot:    'Snapshots',
  restoreSpec: 'Restore specs',
  monitor:     'Monitors',
  alertRule:   'Alert rules',
  auditEvent:  'Audit events',
}

// ─── Recent searches ──────────────────────────────────────────────────────────

const RECENT_KEY = 'backupos:recent-searches'
const MAX_RECENT = 5

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}

function saveRecent(query: string): void {
  const prev = loadRecent().filter(q => q !== query)
  localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...prev].slice(0, MAX_RECENT)))
}

// ─── Flat item type for keyboard nav ─────────────────────────────────────────

type FlatItem =
  | { kind: 'command'; item: CommandItem }
  | { kind: 'result';  item: SearchResult }
  | { kind: 'recent';  query: string }

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { open, closePalette }               = useCommandPalette()
  const [query,    setQuery]                 = useState('')
  const [results,  setResults]               = useState<SearchResult[]>([])
  const [recent,   setRecent]                = useState<string[]>([])
  const [selected, setSelected]              = useState(0)
  const [isPending, startTransition]         = useTransition()
  const inputRef                             = useRef<HTMLInputElement>(null)
  const router                               = useRouter()

  // Load recent on open
  useEffect(() => {
    if (open) {
      setRecent(loadRecent())
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await search(query.trim())
        setResults(r)
        setSelected(0)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Build flat list for keyboard nav
  const flatItems: FlatItem[] = []
  const filteredCommands = COMMANDS.filter(c =>
    query.trim().length === 0 ||
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.sublabel.toLowerCase().includes(query.toLowerCase())
  )
  for (const cmd of filteredCommands) flatItems.push({ kind: 'command', item: cmd })
  for (const res of results)          flatItems.push({ kind: 'result',  item: res })
  if (query.trim().length === 0) {
    for (const q of recent)            flatItems.push({ kind: 'recent',  query: q })
  }

  const navigate = useCallback((item: FlatItem) => {
    if (item.kind === 'recent') {
      setQuery(item.query)
      return
    }
    const url = item.kind === 'command' ? item.item.url : item.item.url
    if (item.kind !== 'recent' && query.trim().length >= 2) saveRecent(query.trim())
    closePalette()
    router.push(url)
  }, [query, closePalette, router])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { closePalette(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatItems.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && flatItems[selected]) { e.preventDefault(); navigate(flatItems[selected]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, flatItems, selected, navigate, closePalette])

  if (!open) return null

  // Group results by type for display
  const groupedResults: { type: ResultType; items: SearchResult[] }[] = []
  const seen = new Set<ResultType>()
  for (const r of results) {
    if (!seen.has(r.type)) { seen.add(r.type); groupedResults.push({ type: r.type, items: [] }) }
    groupedResults.find(g => g.type === r.type)!.items.push(r)
  }

  // Track index offsets for keyboard nav highlighting
  let navIdx = 0

  return (
    <div
      onClick={closePalette}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 640,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: 520,
        }}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', height: 52, flexShrink: 0,
          borderBottom: `1px solid ${query || results.length ? 'var(--border)' : 'transparent'}`,
        }}>
          <Search size={16} color="var(--fg-dim)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs, repositories, agents…"
            style={{
              flex: 1, fontSize: 15, color: 'var(--fg)',
              background: 'none', border: 'none', outline: 'none',
              caretColor: 'var(--accent)',
            }}
          />
          {isPending && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Searching…</span>
          )}
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2, display: 'flex' }}
            >
              <X size={14} />
            </button>
          )}
          <kbd style={{
            fontSize: 11, color: 'var(--fg-faint)',
            backgroundColor: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
          }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Commands */}
          {filteredCommands.length > 0 && (
            <div>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Commands
              </div>
              {filteredCommands.map(cmd => {
                const isSelected = navIdx++ === selected
                return (
                  <button
                    key={cmd.id}
                    onClick={() => navigate({ kind: 'command', item: cmd })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={13} color="var(--fg-mute)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{cmd.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{cmd.sublabel}</div>
                    </div>
                    {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Entity results grouped by type */}
          {groupedResults.map(group => {
            const Icon = TYPE_ICON[group.type]
            return (
              <div key={group.type}>
                <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {TYPE_LABEL[group.type]}
                </div>
                {group.items.map(item => {
                  const isSelected = navIdx++ === selected
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate({ kind: 'result', item })}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} color="var(--fg-mute)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sublabel}</div>
                      </div>
                      {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* Recent searches (when query is empty) */}
          {query.trim().length === 0 && recent.length > 0 && (
            <div>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Recent searches
              </div>
              {recent.map(q => {
                const isSelected = navIdx++ === selected
                return (
                  <button
                    key={q}
                    onClick={() => navigate({ kind: 'recent', query: q })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={13} color="var(--fg-mute)" />
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-mute)' }}>{q}</div>
                    {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* No results */}
          {query.trim().length >= 2 && results.length === 0 && !isPending && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
              No results for "{query}"
            </div>
          )}

          {/* Empty state */}
          {query.trim().length === 0 && recent.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
              Type to search jobs, repos, agents, and more
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--fg-faint)', flexShrink: 0,
        }}>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↵</kbd> select</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>Esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors. Common issues:
- `search` imported from `@/app/actions/search` — verify the export name matches
- `Activity` lucide icon may not exist — substitute `BarChart2` if missing
- `navIdx` used as mutable counter inside render — this is intentional (reset each render, not state)

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/command-palette.tsx
git commit -m "feat: add CommandPalette overlay with search, keyboard nav, and recent searches"
```

---

### Task 4: Wire Layout and Topbar

**Files:**
- Modify: `apps/web/app/(dashboard)/layout.tsx`
- Modify: `apps/web/components/topbar.tsx`

- [ ] **Step 1: Read both files**

```bash
cat "apps/web/app/(dashboard)/layout.tsx"
cat apps/web/components/topbar.tsx
```

- [ ] **Step 2: Modify layout.tsx**

Add imports:
```typescript
import { CommandPaletteProvider } from '@/components/command-palette-provider'
import { CommandPalette }         from '@/components/command-palette'
```

Wrap `DrModeProvider` with `CommandPaletteProvider` and add `<CommandPalette />` as sibling to `<DrModeOverlay />`:

```tsx
return (
  <CommandPaletteProvider>
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
      <CommandPalette />
    </DrModeProvider>
  </CommandPaletteProvider>
)
```

- [ ] **Step 3: Modify topbar.tsx**

Add import:
```typescript
import { useCommandPalette } from '@/components/command-palette-provider'
```

Inside `Topbar()`, add:
```typescript
const { openPalette } = useCommandPalette()
```

Wire the search bar `div` to open the palette on click:
```tsx
<div
  onClick={openPalette}
  role="button"
  tabIndex={0}
  onKeyDown={e => e.key === 'Enter' && openPalette()}
  style={{
    width: 320, flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 8,
    backgroundColor: 'var(--surf)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 12px', height: 32, cursor: 'pointer',
  }}
>
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
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any errors. Common issues:
- `CommandPaletteProvider` wrapping a Server Component layout — this is fine because it's a Client Component that accepts `children`, same pattern as `DrModeProvider`
- `useCommandPalette` in `Topbar` — Topbar is already `'use client'` so this works

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/layout.tsx" apps/web/components/topbar.tsx
git commit -m "feat: wire CommandPalette into dashboard layout and topbar search bar"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.7) | Task |
|---|---|
| ⌘K opens full-screen overlay | Task 2 (provider keyboard listener) + Task 3 (overlay renders when open) |
| Input field at top, 48px tall | Task 3 (52px input row with border-bottom) |
| Results grouped by type under section headers | Task 3 (groupedResults + TYPE_LABEL headers) |
| Each result: icon · primary label · secondary metadata · action hint | Task 3 (icon div + label + sublabel + ↵ hint) |
| Keyboard nav: ↑↓ to move, ↵ to activate, ⌘K or Esc to dismiss | Task 2 (⌘K toggle) + Task 3 (ArrowUp/Down/Enter/Escape handlers) |
| Recent searches saved locally, shown when input empty | Task 3 (localStorage + recent section) |
| Command actions searchable ("Enrol agent", "Create job", etc.) | Task 3 (COMMANDS array + filter) |
| Commands section | Task 3 (Commands section header in results) |

### Placeholder scan

No TBD/TODO. All sections have complete code.

### Type consistency

- `SearchResult` exported from `lib/search.ts`, imported in both `actions/search.ts` and `command-palette.tsx` — consistent
- `ResultType` exported from `lib/search.ts`, imported in `command-palette.tsx` — consistent
- `search(query)` server action returns `Promise<SearchResult[]>` — matches `useState<SearchResult[]>` in palette
- `FlatItem` union type covers all three keyboard-nav item kinds — `navigate()` handles all three with correct URL resolution
- `useCommandPalette()` used in `Topbar` (client) and `CommandPalette` (client), provided by `CommandPaletteProvider` in layout — consistent
