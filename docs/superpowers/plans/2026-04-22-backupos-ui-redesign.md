# BackupOS UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign BackupOS from a dark inline-style UI to a clean light-theme dashboard with amber accents and card-grid layouts.

**Architecture:** The codebase already uses CSS custom properties throughout all components — swapping to a light theme is largely a CSS variable swap in `globals.css`. Missing components (`Card`, `PageHeader`) are added, then the Dashboard page is rebuilt with the approved card-grid layout. All data fetching is untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (already imported), CSS custom properties, inline styles with CSS vars, Lucide icons, pnpm monorepo.

---

## File Map

**Modify:**
- `apps/web/app/globals.css` — add `:root` light-theme token block, remove forced dark color-scheme
- `apps/web/components/sidebar.tsx` — amber active indicator, user avatar initials, cleaned footer
- `apps/web/components/topbar.tsx` — breadcrumb title fix, remove hardcoded style smell
- `apps/web/app/(dashboard)/dashboard/page.tsx` — full card-grid layout redesign

**Create:**
- `apps/web/components/ui/card.tsx` — `Card`, `CardHeader`, `CardBody`, `CardFooter`
- `apps/web/components/ui/page-header.tsx` — `PageHeader` with title + optional action slot

---

## Task 1: Light-theme CSS variables

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add `:root` light-theme block above the existing `:root.dark` block**

Open `apps/web/app/globals.css`. After `@layer base {` and before `:root.dark {`, insert:

```css
  :root {
    /* Surfaces */
    --bg:    #f9fafb;
    --bg2:   #ffffff;
    --surf:  #ffffff;
    --surf2: #f3f4f6;

    /* Borders */
    --border:  #e5e7eb;
    --border2: #f3f4f6;

    /* Text */
    --fg:       #111827;
    --fg-mute:  #374151;
    --fg-dim:   #6b7280;
    --fg-faint: #9ca3af;

    /* Accent — BackupOS amber */
    --accent:      #f59e0b;
    --accent-fg:   #ffffff;
    --accent-dim:  #fef3c7;
    --accent-ring: rgba(245, 158, 11, 0.28);
    --accent-deep: #d97706;
    --white:       #ffffff;

    /* Semantic */
    --ok:      #16a34a;   --ok-dim:   #dcfce7;
    --warn:    #d97706;   --warn-dim: #fef3c7;
    --err:     #dc2626;   --err-dim:  #fee2e2;
    --info:    #2563eb;   --info-dim: #dbeafe;

    /* Typography */
    --font-sans: 'Inter', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

    /* Spacing */
    --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
    --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
    --space-8: 32px;  --space-10: 40px; --space-12: 48px;

    /* Radius */
    --radius-sm: 8px;
    --radius:    12px;
    --radius-lg: 16px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow:    0 1px 6px rgba(0,0,0,0.08);
    --shadow-lg: 0 4px 20px rgba(0,0,0,0.12);
  }
```

- [ ] **Step 2: Change the default color-scheme from dark to light**

Find this block inside `@layer base`:

```css
  html {
    color-scheme: dark;
  }
```

Replace with:

```css
  html {
    color-scheme: light;
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify the theme flipped**

```bash
pnpm dev
```

Open http://localhost:3000. The app should now render on a white/light-grey background with dark text. The sidebar, cards, and tables will already look substantially different. This confirms the CSS variable cascade is working.

- [ ] **Step 5: Stop dev server, commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(ui): add light-theme CSS variable set, switch default color-scheme to light"
```

---

## Task 2: Card component

**Files:**
- Create: `apps/web/components/ui/card.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode, CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
}

export function Card({ children, style }: CardProps) {
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ children, style }: CardProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border2)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--fg-dim)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
    }}>
      {children}
    </span>
  )
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--accent-deep)',
      textDecoration: 'none',
    }}>
      {children}
    </a>
  )
}

export function CardBody({ children, style }: CardProps) {
  return (
    <div style={{ padding: '12px 16px', ...style }}>
      {children}
    </div>
  )
}

export function CardFooter({ children, style }: CardProps) {
  return (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid var(--border2)',
      backgroundColor: 'var(--surf2)',
      ...style,
    }}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/card.tsx
git commit -m "feat(ui): add Card, CardHeader, CardTitle, CardLink, CardBody, CardFooter components"
```

---

## Task 3: PageHeader component

**Files:**
- Create: `apps/web/components/ui/page-header.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  action?: ReactNode
  description?: string
}

export function PageHeader({ title, action, description }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: description ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: 12,
    }}>
      <div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--fg)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '4px 0 0' }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/page-header.tsx
git commit -m "feat(ui): add PageHeader component with title, optional description and action slot"
```

---

## Task 4: Rebuild Sidebar

The sidebar already uses CSS variables so the light theme works automatically. This task improves the visual hierarchy: adds a left-border active indicator, adds initials-based avatar fallback, and tightens the footer.

**Files:**
- Modify: `apps/web/components/sidebar.tsx`

- [ ] **Step 1: Read the current file**

The current file is at `apps/web/components/sidebar.tsx`. You already have it in context from earlier exploration.

- [ ] **Step 2: Replace the full file**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Activity, PlayCircle, Clock, Camera,
  Server, Database, Radar, RotateCcw, ListRestart,
  TriangleAlert, FileClock, Settings, BookOpen, FileTerminal, ShieldCheck,
} from 'lucide-react'
import { ProfilePopover } from './profile-popover'

interface NavItem  { href: string; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }
interface SidebarUser { name: string; email: string; image?: string | null }

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
      { href: '/activity',  label: 'Activity',  icon: <Activity size={15} /> },
      { href: '/logs',      label: 'Logs',      icon: <FileTerminal size={15} /> },
      { href: '/docs',      label: 'Docs',      icon: <BookOpen size={15} /> },
    ],
  },
  {
    label: 'Backup',
    items: [
      { href: '/jobs',         label: 'Jobs',         icon: <PlayCircle size={15} /> },
      { href: '/schedules',    label: 'Schedules',    icon: <Clock size={15} /> },
      { href: '/snapshots',    label: 'Snapshots',    icon: <Camera size={15} /> },
      { href: '/verification', label: 'Verification', icon: <ShieldCheck size={15} /> },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/agents',       label: 'Agents',       icon: <Server size={15} /> },
      { href: '/repositories', label: 'Repositories', icon: <Database size={15} /> },
      { href: '/monitors',     label: 'Monitors',     icon: <Radar size={15} /> },
    ],
  },
  {
    label: 'Restore',
    items: [
      { href: '/restore',      label: 'Restore specs', icon: <RotateCcw size={15} /> },
      { href: '/restore/runs', label: 'Restore runs',  icon: <ListRestart size={15} /> },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/alerts', label: 'Alerts',    icon: <TriangleAlert size={15} /> },
      { href: '/audit',  label: 'Audit log', icon: <FileClock size={15} /> },
    ],
  },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function Logo() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 16px', height: 52, flexShrink: 0,
      borderBottom: '1px solid var(--border2)',
    }}>
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="12" fill="#1A1206" />
        <rect x="6"  y="6"  width="16" height="16" rx="3" fill="#F5A623" />
        <rect x="26" y="6"  width="16" height="16" rx="3" fill="#854F0B" />
        <rect x="6"  y="26" width="16" height="16" rx="3" fill="#854F0B" />
        <rect x="26" y="26" width="16" height="16" rx="3" fill="#C77A14" />
        <rect x="18" y="18" width="12" height="12" rx="3" fill="#FEF5E0" />
      </svg>
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--fg)' }}>Backup</span>
        <span style={{ color: 'var(--accent)' }}>OS</span>
      </span>
    </div>
  )
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 228, minWidth: 228,
      backgroundColor: 'var(--bg2)',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <Logo />

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        {NAV.map(group => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 10, color: 'var(--fg-faint)',
              letterSpacing: '0.07em', fontWeight: 600,
              padding: '10px 8px 4px', textTransform: 'uppercase',
            }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href
                || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 8px 0 6px', height: 34,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--accent-deep)' : 'var(--fg-dim)',
                    backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'background-color 0.12s, color 0.12s',
                    marginBottom: 1,
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{
        padding: '10px 10px 12px',
        borderTop: '1px solid var(--border2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Link
            href="/settings"
            title="Settings"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 'var(--radius-sm)',
              color: 'var(--fg-faint)', textDecoration: 'none',
            }}
          >
            <Settings size={15} />
          </Link>
        </div>
        <ProfilePopover user={user} />
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>
          Solo · v0.1.0
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Start dev server, verify sidebar**

```bash
pnpm dev
```

Open http://localhost:3000. Confirm: white sidebar, amber left-border on active nav item, amber text on active item, amber background tint on active item, group labels are lighter and smaller.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sidebar.tsx
git commit -m "feat(ui): rebuild sidebar — light theme, amber active indicator, tighter footer"
```

---

## Task 5: Update Topbar

The topbar already uses CSS variables so light theme works. This task tightens the styling and improves the breadcrumb header.

**Files:**
- Modify: `apps/web/components/topbar.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { Search, Bell, ShieldAlert } from 'lucide-react'
import { useDrMode } from '@/components/dr-mode-provider'
import { useCommandPalette } from '@/components/command-palette-provider'

const LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  activity:     'Activity',
  logs:         'Logs',
  jobs:         'Jobs',
  schedules:    'Schedules',
  snapshots:    'Snapshots',
  agents:       'Agents',
  repositories: 'Repositories',
  monitors:     'Monitors',
  restore:      'Restore',
  runs:         'Runs',
  alerts:       'Alerts',
  audit:        'Audit log',
  settings:     'Settings',
  new:          'New',
  verification: 'Verification',
  docs:         'Docs',
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
  const { openPalette }                  = useCommandPalette()

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
        height: 52,
        backgroundColor: active
          ? 'color-mix(in srgb, var(--bg2) 92%, #cc0000 8%)'
          : 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12, flexShrink: 0,
        transition: 'background-color 0.3s ease',
      }}>
        {/* Breadcrumb */}
        <nav style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, minWidth: 0, flex: 1,
        }}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              {i > 0 && (
                <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>/</span>
              )}
              <span style={{
                color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--fg-dim)',
                fontWeight: i === crumbs.length - 1 ? 600 : 400,
              }}>
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        {/* Search */}
        <div
          onClick={openPalette}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && openPalette()}
          style={{
            width: 220, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 10px', height: 32, cursor: 'pointer',
          }}
        >
          <Search size={12} color="var(--fg-faint)" />
          <span style={{ fontSize: 12, color: 'var(--fg-faint)', flex: 1 }}>Search…</span>
          <kbd style={{
            fontSize: 10, color: 'var(--fg-faint)',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
          }}>⌘K</kbd>
        </div>

        {/* DR Mode */}
        <button
          onClick={toggle}
          title={active ? 'Exit DR Mode (⌘⇧D)' : 'Enter DR Mode (⌘⇧D)'}
          aria-pressed={active}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: active || pulse ? 'var(--err)' : 'var(--fg-faint)',
            background: active ? 'var(--err-dim)' : 'none',
            border: active ? '1px solid color-mix(in srgb, var(--err-dim) 50%, var(--err) 50%)' : 'none',
            cursor: 'pointer',
            animation: pulse ? 'dr-pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          <ShieldAlert size={15} />
        </button>

        {/* Notifications */}
        <button
          title="Notifications"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-faint)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <Bell size={15} />
        </button>
      </header>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/topbar.tsx
git commit -m "feat(ui): update topbar — light theme polish, tighter search, cleaner breadcrumb weight"
```

---

## Task 6: Rebuild Dashboard page

This is the largest change. The current dashboard is a vertical stack of individual sections. We replace it with the approved card-grid layout: stat row up top, then a two-column card grid (recent runs left, schedules+alerts right). All data fetching stays identical.

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Replace the page's JSX return, keeping all data fetching and helper functions identical**

Replace only the `return (...)` block (lines 171–392 in the original). Everything above line 171 (imports, helpers, data fetching) stays exactly as-is. Replace the return with:

```tsx
  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* Health score */}
      <HealthScoreCard
        score={healthScore.score}
        grade={healthScore.grade}
        gradeColor={healthScore.gradeColor}
        factors={healthScore.factors}
        sparkline={sparkline}
      />

      {/* Stat row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 16,
        marginTop: 16,
      }}>
        <StatCard label="Backup jobs"  value={jobs.length} />
        <StatCard label="Repositories" value={repos.length} />
        <StatCard label="Agents"       value={allAgents.length} footer={`${agentsOnline} online`} />
        <StatCard
          label="Runs (24 h)"
          value={runs24h.length}
          delta={failed24h > 0
            ? { text: `${failed24h} failed`, direction: 'down' }
            : runs24h.length > 0 ? { text: 'all ok', direction: 'up' } : undefined}
        />
        <StatCard
          label="Verified (7d)"
          value={`${verifiedPct}%`}
          footer={`${verifiedJobIds.size} / ${enabledJobs} jobs`}
          delta={verifiedPct < 80
            ? { text: 'below 80% target', direction: 'down' }
            : { text: 'on target', direction: 'up' }}
        />
      </div>

      {/* Services without backups warning */}
      {uncoveredServices.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--border) 60%, var(--warn) 40%)' }}>
          <CardHeader>
            <CardTitle>Services without backups</CardTitle>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--warn)',
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--warn-dim)',
            }}>
              {uncoveredServices.length} unprotected
            </span>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {uncoveredServices.map((svc, i) => {
              const sourceType = SOURCE_TYPE_MAP[svc.serviceType] ?? 'filesystem'
              const href = `/jobs/new?name=${encodeURIComponent(svc.name)}&sourceType=${encodeURIComponent(sourceType)}&infraServiceId=${encodeURIComponent(svc.id)}`
              return (
                <div key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border2)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                    </div>
                  </div>
                  <a href={href} style={{
                    fontSize: 12, padding: '4px 12px',
                    borderRadius: 'var(--radius-sm)', border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-fg)',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}>
                    Create job →
                  </a>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {/* Two-column card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 16 }}>

        {/* Recent runs card */}
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardLink href="/activity">View all →</CardLink>
          </CardHeader>
          {recentRuns.length === 0 ? (
            <CardBody>
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
                No backup runs yet.
              </div>
            </CardBody>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Status', 'Job', 'Duration', 'Size', 'Age'].map((h, i) => (
                    <th key={h} style={{
                      padding: '8px 16px', textAlign: i > 1 ? 'right' : 'left',
                      fontSize: 10, fontWeight: 600, color: 'var(--fg-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      backgroundColor: 'var(--surf2)',
                      borderBottom: '1px solid var(--border2)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRuns.map(run => (
                  <tr key={run.id} style={{ borderTop: '1px solid var(--border2)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge status={toBadge(run.status)} />
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
                      {run.jobName ?? run.jobId ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtDuration(run.duration)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtBytes(run.dataAdded)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtAge(run.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Right column: Agents + Bandwidth stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Agents card */}
          <Card>
            <CardHeader>
              <CardTitle>Agents</CardTitle>
              <CardLink href="/agents">Manage →</CardLink>
            </CardHeader>
            {allAgents.length === 0 ? (
              <CardBody>
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
                  No agents enrolled
                </div>
              </CardBody>
            ) : (
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allAgents.map(agent => (
                  <div key={agent.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{agent.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>
                        {agent.hostname ?? agent.ip ?? '—'}
                      </div>
                    </div>
                    <Badge status={toBadge(agent.status ?? 'disconnected')} />
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          {/* Bandwidth card */}
          <Card>
            <CardHeader>
              <CardTitle>Bandwidth (global)</CardTitle>
              <CardLink href="/settings/bandwidth">Configure →</CardLink>
            </CardHeader>
            <CardBody>
              {globalProfile ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', marginBottom: 2, letterSpacing: '-0.02em' }}>
                    {fmtLimit(currentLimit)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 10 }}>
                    {globalProfile.name} · now ({currentHour}:00)
                  </div>
                  {(() => {
                    const W = 168, H = 28, BAR_W = 6, GAP = 1
                    return (
                      <svg width={W} height={H}>
                        {sparkValues.map((v, h) => {
                          const barH = Math.max(3, Math.round((v / UNLIMITED_KBPS) * H))
                          const x    = h * (BAR_W + GAP)
                          const fill = v >= UNLIMITED_KBPS ? 'var(--ok)' : 'var(--warn)'
                          return (
                            <rect key={h} x={x} y={H - barH} width={BAR_W} height={barH}
                              fill={fill} opacity={h === currentHour ? 1 : 0.45} rx={1} />
                          )
                        })}
                      </svg>
                    )
                  })()}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                  No global profile.{' '}
                  <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Configure one.</a>
                </div>
              )}
            </CardBody>
          </Card>

        </div>
      </div>
    </div>
  )
```

- [ ] **Step 2: Add missing imports at the top of the file**

The file currently imports `StatCard` and `Badge`. Add `Card`, `CardHeader`, `CardTitle`, `CardLink`, `CardBody`, and `PageHeader`:

```tsx
import { Card, CardHeader, CardTitle, CardLink, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify the dashboard**

```bash
pnpm dev
```

Navigate to http://localhost:3000/dashboard. Confirm:
- HealthScoreCard renders at top
- 5-column stat grid below it
- Two-column card grid: recent runs table on left, agents + bandwidth stacked on right
- Services-without-backups warning renders only if there are uncovered services

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(ui): rebuild dashboard — card-grid layout with stat row, recent runs, agents, bandwidth"
```

---

## Task 7: Update JobsTable header to use PageHeader

The `jobs-table.tsx` renders its own `h1` heading inline. Swap it for `PageHeader` for consistency. Everything else (checkboxes, bulk actions, run strip, table) stays identical.

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/jobs-table.tsx`

- [ ] **Step 1: Add import at the top of the file**

Add after existing imports:

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: Replace the heading block**

Find:
```tsx
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Jobs</h1>
        <Link
          href="/jobs/new"
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#fff', textDecoration: 'none',
          }}
        >
          New job
        </Link>
      </div>
```

Replace with:
```tsx
      <PageHeader
        title="Jobs"
        action={
          <Link
            href="/jobs/new"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
              color: 'var(--accent-fg)', textDecoration: 'none',
            }}
          >
            New job
          </Link>
        }
      />
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/jobs/jobs-table.tsx"
git commit -m "feat(ui): use PageHeader in JobsTable for consistent page heading"
```

---

## Task 8: Full build verification

- [ ] **Step 1: Run typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run build**

```bash
cd apps/web && pnpm build
```

Expected: build completes successfully with no type errors. Note any warnings but do not treat them as failures unless the build exits non-zero.

- [ ] **Step 3: Start dev server for final visual review**

```bash
pnpm dev
```

Walk through these routes and confirm each renders correctly on the light theme:
- `/dashboard` — stat grid + card grid
- `/jobs` — table with amber active link, badge statuses, run strips
- `/schedules`, `/snapshots`, `/repositories`, `/monitors`, `/agents` — tables with correct light backgrounds
- `/alerts`, `/audit` — table pages
- `/restore`, `/restore/runs` — table pages
- `/activity`, `/logs` — list/log views
- `/login` — auth page (no sidebar, centred card)

- [ ] **Step 4: Commit build verification**

```bash
git add -A
git commit -m "chore: verify clean build after UI redesign"
```

---

## Task 9: Add PageHeader to remaining list pages

The CSS variable swap already fixes colours on these pages. This task adds `PageHeader` to their top-level headings for consistency. No data changes.

**Files to modify** (same pattern for each):
- `apps/web/app/(dashboard)/schedules/page.tsx`
- `apps/web/app/(dashboard)/repositories/page.tsx`
- `apps/web/app/(dashboard)/monitors/page.tsx`
- `apps/web/app/(dashboard)/agents/page.tsx`
- `apps/web/app/(dashboard)/snapshots/page.tsx`
- `apps/web/app/(dashboard)/alerts/page.tsx`
- `apps/web/app/(dashboard)/audit/page.tsx`
- `apps/web/app/(dashboard)/activity/page.tsx`

- [ ] **Step 1: For each file above, add the import and replace the inline h1 heading**

For each file, add at the top of imports:
```tsx
import { PageHeader } from '@/components/ui/page-header'
```

Then find the existing `<h1>` heading (usually `<h1 style={{ fontSize: 22, ... }}>PageName</h1>`) and replace with:
```tsx
<PageHeader title="Page Name" />
```

For pages that have a create/new button next to the heading (e.g. Schedules, Agents), pass it via the `action` prop:
```tsx
<PageHeader
  title="Schedules"
  action={
    <Link href="/schedules/new" style={{
      padding: '7px 16px', fontSize: 13, fontWeight: 500,
      borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
      color: 'var(--accent-fg)', textDecoration: 'none',
    }}>
      New schedule
    </Link>
  }
/>
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/schedules/page.tsx" \
        "apps/web/app/(dashboard)/repositories/page.tsx" \
        "apps/web/app/(dashboard)/monitors/page.tsx" \
        "apps/web/app/(dashboard)/agents/page.tsx" \
        "apps/web/app/(dashboard)/snapshots/page.tsx" \
        "apps/web/app/(dashboard)/alerts/page.tsx" \
        "apps/web/app/(dashboard)/audit/page.tsx" \
        "apps/web/app/(dashboard)/activity/page.tsx"
git commit -m "feat(ui): add PageHeader to all list pages for consistent heading pattern"
```

---

## Scope note

Detail pages (`/repositories/[id]`, `/monitors/[id]`, `/restore/[id]`, `/verification/[id]`, `/jobs/[id]`) inherit the light theme automatically via CSS variables. Their layouts benefit from a second-pass card redesign but are not in scope for this plan. Track that work separately.
