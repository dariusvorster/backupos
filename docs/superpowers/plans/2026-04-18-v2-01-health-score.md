# Health Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a health score (0–100 with letter grade A+→F) to the dashboard hero area, with factor mini-bars, a 30-day sparkline, and a click-to-open breakdown modal.

**Architecture:** A pure computation function in `apps/web/lib/health-score.ts` accepts pre-fetched DB data and returns a typed score object — no DB calls inside, fully testable. A `'use client'` `HealthScoreCard` component owns the hero card and breakdown modal (needs `useState`). The existing dashboard server component fetches the extra data and passes it down as props.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM (`gte` / `isNull` / `and` already re-exported from `@backupos/db`), inline SVG polyline sparkline, CSS custom properties.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/lib/health-score.ts` | Pure score computation + types + sparkline builder |
| Create | `apps/web/components/ui/health-score-card.tsx` | Client component — hero card + breakdown modal |
| Modify | `apps/web/app/(dashboard)/dashboard/page.tsx` | Fetch health-score data, compute score, render card |

---

## Score algorithm

Four factors, weights sum to 100:

| Factor | Weight | Source |
|--------|--------|--------|
| Jobs with successful run in last 24h | 40 | `backupRuns` WHERE status='success' AND startedAt ≥ now-24h — distinct jobIds |
| Repos with integrity check OK in last 7d | 20 | `repositories.lastCheckStatus='ok'` AND `lastCheckedAt ≥ now-7d` |
| Agents online | 20 | `agents.status='connected'` |
| Open storage alerts penalty | 20 | `storageAlerts` WHERE `resolvedAt IS NULL` — each alert costs 20 pts |

`score = round((jobScore×40 + repoScore×20 + agentScore×20 + alertScore×20) / 100)`

Letter grades: A+ ≥ 95 · A ≥ 85 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F < 40

Grade colour: `var(--ok)` for A+/A/B, `var(--warn)` for C, `var(--err)` for D/F.

Sparkline: last 30 days of backup runs grouped by calendar day — daily success rate (0–100).

---

## Task 1: Health score computation library

**Files:**
- Create: `apps/web/lib/health-score.ts`

- [ ] **Step 1: Create the file**

```typescript
// apps/web/lib/health-score.ts

export interface HealthFactor {
  label: string
  score: number    // 0–100
  weight: number   // percentage weight in final score
  value: string    // human-readable current value e.g. "3 / 5"
  detail: string   // explanation / what to fix
}

export interface HealthScore {
  score: number       // 0–100
  grade: string       // 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  gradeColor: string  // CSS var string
  factors: HealthFactor[]
}

export interface HealthScoreInput {
  enabledJobs: number
  jobsWithSuccessIn24h: number
  totalRepos: number
  reposWithRecentCheck: number
  totalAgents: number
  onlineAgents: number
  openAlerts: number
}

export function computeGrade(score: number): { grade: string; gradeColor: string } {
  if (score >= 95) return { grade: 'A+', gradeColor: 'var(--ok)' }
  if (score >= 85) return { grade: 'A',  gradeColor: 'var(--ok)' }
  if (score >= 75) return { grade: 'B',  gradeColor: 'var(--ok)' }
  if (score >= 60) return { grade: 'C',  gradeColor: 'var(--warn)' }
  if (score >= 40) return { grade: 'D',  gradeColor: 'var(--err)' }
  return { grade: 'F', gradeColor: 'var(--err)' }
}

export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const jobScore = input.enabledJobs === 0
    ? 100
    : Math.round((input.jobsWithSuccessIn24h / input.enabledJobs) * 100)

  const repoScore = input.totalRepos === 0
    ? 100
    : Math.round((input.reposWithRecentCheck / input.totalRepos) * 100)

  const agentScore = input.totalAgents === 0
    ? 100
    : Math.round((input.onlineAgents / input.totalAgents) * 100)

  const alertScore = Math.max(0, 100 - input.openAlerts * 20)

  const factors: HealthFactor[] = [
    {
      label: 'Jobs backed up in last 24h',
      score: jobScore,
      weight: 40,
      value: `${input.jobsWithSuccessIn24h} / ${input.enabledJobs}`,
      detail: jobScore === 100
        ? 'All enabled jobs ran successfully'
        : `${input.enabledJobs - input.jobsWithSuccessIn24h} job(s) missed their last run`,
    },
    {
      label: 'Repositories checked (7d)',
      score: repoScore,
      weight: 20,
      value: `${input.reposWithRecentCheck} / ${input.totalRepos}`,
      detail: repoScore === 100
        ? 'All repositories have a recent integrity check'
        : `${input.totalRepos - input.reposWithRecentCheck} repo(s) not checked in 7 days`,
    },
    {
      label: 'Agents online',
      score: agentScore,
      weight: 20,
      value: `${input.onlineAgents} / ${input.totalAgents}`,
      detail: agentScore === 100
        ? 'All agents are connected'
        : `${input.totalAgents - input.onlineAgents} agent(s) are offline`,
    },
    {
      label: 'Open alerts',
      score: alertScore,
      weight: 20,
      value: input.openAlerts === 0 ? 'None' : `${input.openAlerts} open`,
      detail: input.openAlerts === 0
        ? 'No open storage alerts'
        : `${input.openAlerts} storage alert(s) need attention (−20 pts each)`,
    },
  ]

  const score = Math.round(
    (jobScore * 40 + repoScore * 20 + agentScore * 20 + alertScore * 20) / 100,
  )

  const { grade, gradeColor } = computeGrade(score)
  return { score, grade, gradeColor, factors }
}

// Returns 30 values (oldest first) — daily backup success rate 0–100.
// Uses backup run history; days with no runs return 0.
export function buildSparkline(
  runs: { status: string; startedAt: Date | null }[],
): number[] {
  const byDay = new Map<string, { success: number; total: number }>()
  for (const run of runs) {
    if (!run.startedAt) continue
    const day = run.startedAt.toISOString().slice(0, 10)
    const entry = byDay.get(day) ?? { success: 0, total: 0 }
    entry.total++
    if (run.status === 'success') entry.success++
    byDay.set(day, entry)
  }
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10)
    const entry = byDay.get(day)
    return entry ? Math.round((entry.success / entry.total) * 100) : 0
  })
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: exits with no errors.

- [ ] **Step 3: Spot-check the algorithm manually**

```bash
node -e "
const { computeHealthScore, buildSparkline } = require('./apps/web/lib/health-score.ts')
" 2>&1 | head -5
```

Expected: error (ts-node not wired) — that's fine, typecheck above is the real gate.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/health-score.ts
git commit -m "feat: health score computation function + sparkline builder"
```

---

## Task 2: HealthScoreCard component

**Files:**
- Create: `apps/web/components/ui/health-score-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
// apps/web/components/ui/health-score-card.tsx
'use client'

import { useState } from 'react'
import type { HealthFactor } from '@/lib/health-score'

interface HealthScoreCardProps {
  score: number
  grade: string
  gradeColor: string
  factors: HealthFactor[]
  sparkline: number[]   // 30 values, oldest first, 0–100
}

function factorColor(score: number): string {
  if (score >= 75) return 'var(--ok)'
  if (score >= 50) return 'var(--warn)'
  return 'var(--err)'
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 120, H = 32
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - (v / max) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HealthScoreCard({
  score, grade, gradeColor, factors, sparkline,
}: HealthScoreCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hero card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
        style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 32, marginBottom: 32,
          outline: 'none',
        }}
      >
        {/* Big number + grade */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
          <span style={{
            fontSize: 64, fontWeight: 400, fontFamily: 'var(--font-mono)',
            color: gradeColor, lineHeight: 1,
          }}>
            {score}
          </span>
          <span style={{ fontSize: 32, fontWeight: 600, color: gradeColor }}>{grade}</span>
        </div>

        {/* Label + sparkline */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: 'var(--fg-mute)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Health score · last 30 days
          </div>
          <Sparkline data={sparkline} color={gradeColor} />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Click for breakdown
          </div>
        </div>

        {/* Factor mini-bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {factors.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 72, height: 4, borderRadius: 2,
                backgroundColor: 'var(--surf2)', flexShrink: 0, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${f.score}%`, height: '100%', borderRadius: 2,
                  backgroundColor: factorColor(f.score),
                }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 32, width: 480, maxWidth: '90vw',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>
                  Health score breakdown
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
                  Overall:{' '}
                  <span style={{
                    color: gradeColor,
                    fontFamily: 'var(--font-mono)', fontWeight: 600,
                  }}>
                    {score} ({grade})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--fg-mute)', fontSize: 20, lineHeight: 1, padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Factors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {factors.map(f => {
                const fc = factorColor(f.score)
                return (
                  <div key={f.label}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: 12, color: fc, fontFamily: 'var(--font-mono)' }}>
                        {f.value} · {f.score}%
                      </span>
                    </div>
                    <div style={{
                      height: 6, backgroundColor: 'var(--surf2)',
                      borderRadius: 3, overflow: 'hidden', marginBottom: 4,
                    }}>
                      <div style={{
                        width: `${f.score}%`, height: '100%',
                        backgroundColor: fc, borderRadius: 3,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {f.detail} · weight {f.weight}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/health-score-card.tsx
git commit -m "feat: HealthScoreCard component — hero + sparkline + breakdown modal"
```

---

## Task 3: Wire health score into the dashboard page

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

The existing page already fetches `jobs`, `recentRuns`, `allAgents`, `repos`. Add three more queries to the existing `Promise.all` and render `HealthScoreCard` above the KPI grid.

- [ ] **Step 1: Replace the full file**

```tsx
// apps/web/app/(dashboard)/dashboard/page.tsx
import type { ComponentProps } from 'react'
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { HealthScoreCard } from '@/components/ui/health-score-card'
import { computeHealthScore, buildSparkline } from '@/lib/health-score'

type BadgeStatus = ComponentProps<typeof Badge>['status']

const VALID_STATUSES = new Set<string>([
  'healthy', 'success', 'connected', 'online', 'running',
  'warning', 'missed', 'failed', 'error', 'disconnected',
  'offline', 'idle', 'paused', 'verifying',
])

function toBadge(s: string): BadgeStatus {
  return VALID_STATUSES.has(s) ? (s as BadgeStatus) : 'idle'
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtAge(d: Date | null): string {
  if (!d) return '—'
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default async function DashboardPage() {
  const db      = getDb()
  const now     = Date.now()
  const since24h  = new Date(now - 24  * 60 * 60 * 1000)
  const since7d   = new Date(now -  7  * 24 * 60 * 60 * 1000)
  const since30d  = new Date(now - 30  * 24 * 60 * 60 * 1000)

  const [jobs, recentRuns, allAgents, repos, successRuns24h, openAlerts, runs30d] =
    await Promise.all([
      db.select().from(backupJobs).all(),
      db.select({
        id:        backupRuns.id,
        jobId:     backupRuns.jobId,
        jobName:   backupJobs.name,
        status:    backupRuns.status,
        startedAt: backupRuns.startedAt,
        duration:  backupRuns.duration,
        dataAdded: backupRuns.dataAdded,
      })
        .from(backupRuns)
        .leftJoin(backupJobs, eq(backupRuns.jobId, backupJobs.id))
        .orderBy(desc(backupRuns.startedAt))
        .limit(20)
        .all(),
      db.select().from(agents).all(),
      db.select().from(repositories).all(),
      // distinct jobs with a successful run in last 24h
      db.select({ jobId: backupRuns.jobId })
        .from(backupRuns)
        .where(and(eq(backupRuns.status, 'success'), gte(backupRuns.startedAt, since24h)))
        .all(),
      // open storage alerts
      db.select({ id: storageAlerts.id })
        .from(storageAlerts)
        .where(isNull(storageAlerts.resolvedAt))
        .all(),
      // runs in last 30d for sparkline
      db.select({ status: backupRuns.status, startedAt: backupRuns.startedAt })
        .from(backupRuns)
        .where(gte(backupRuns.startedAt, since30d))
        .all(),
    ])

  const runs24h      = recentRuns.filter(r => r.startedAt && r.startedAt >= since24h)
  const failed24h    = runs24h.filter(r => r.status === 'failed').length
  const agentsOnline = allAgents.filter(a => a.status === 'connected').length

  const enabledJobs         = jobs.filter(j => j.enabled).length
  const jobsWithSuccess24h  = new Set(successRuns24h.map(r => r.jobId)).size
  const reposWithRecentCheck = repos.filter(
    r => r.lastCheckStatus === 'ok' && r.lastCheckedAt !== null && r.lastCheckedAt >= since7d,
  ).length

  const healthScore = computeHealthScore({
    enabledJobs,
    jobsWithSuccessIn24h: jobsWithSuccess24h,
    totalRepos: repos.length,
    reposWithRecentCheck,
    totalAgents: allAgents.length,
    onlineAgents: agentsOnline,
    openAlerts: openAlerts.length,
  })
  const sparkline = buildSparkline(runs30d)

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>
        Dashboard
      </h1>

      {/* Health score hero */}
      <HealthScoreCard
        score={healthScore.score}
        grade={healthScore.grade}
        gradeColor={healthScore.gradeColor}
        factors={healthScore.factors}
        sparkline={sparkline}
      />

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
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
      </div>

      {/* Recent runs table */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', marginBottom: 24,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Recent runs
        </div>
        {recentRuns.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No backup runs yet. Enrol an agent to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Job</th>
                <th style={thR}>Duration</th>
                <th style={thR}>Size added</th>
                <th style={thR}>Age</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={toBadge(run.status)} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--fg)' }}>
                    {run.jobName ?? run.jobId ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.duration)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtBytes(run.dataAdded)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtAge(run.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agents card */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Agents
        </div>
        {allAgents.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No agents enrolled — install an agent to start backing up
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, padding: 16 }}>
            {allAgents.map(agent => (
              <div key={agent.id} style={{
                backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  {agent.hostname ?? agent.ip ?? '—'}
                </div>
                <Badge status={toBadge(agent.status ?? 'disconnected')} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 3: Start dev server and verify visually**

```bash
pnpm --filter @backupos/web dev
```

Open `http://localhost:3000/dashboard`. Verify:
- Health score card appears above the KPI row
- Score is a number 0–100, letter grade matches threshold
- Clicking the card opens the breakdown modal
- Clicking backdrop or × closes the modal
- Factor bars fill proportionally and use the right colour (green/amber/red)
- Sparkline renders (may be a flat line if no runs — that's correct)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: health score hero on dashboard — score, grade, sparkline, breakdown modal"
```

---

## Self-review

### Spec coverage

| Spec requirement | Covered |
|---|---|
| §1.11 Health score 0–100 | ✅ Task 1 `computeHealthScore` |
| §1.11 Letter grade A+→F | ✅ Task 1 `computeGrade` |
| §1.11 Dashboard hero — big score + grade | ✅ Task 2 + Task 3 |
| §1.11 Click → breakdown modal | ✅ Task 2 modal |
| §1.11 Factor contribution in modal | ✅ Task 2 — label, value, bar, detail, weight |
| §1.11 Historical sparkline (last 30 days) | ✅ Task 1 `buildSparkline` + Task 2 SVG |
| §1.11 Grade turns red below C | ✅ Task 1 `computeGrade` — C=warn, D/F=err |
| % jobs with successful run 24h × weight 40 | ✅ Factor 1 |
| % repos with recent integrity check × weight 20 | ✅ Factor 2 |
| Agent online % × weight 20 | ✅ Factor 3 |
| Open alerts penalty × weight 20 | ✅ Factor 4 |
| % jobs with passing restore verification × weight | ⏭ Deferred — no verification feature yet |
| % critical Infra OS services with backup job | ⏭ Deferred — no Infra OS integration yet |

### Placeholder scan

No TBDs. All code is complete and ready to copy-paste.

### Type consistency

- `HealthFactor`, `HealthScore`, `HealthScoreInput` defined in Task 1, imported in Task 2 and Task 3.
- `HealthScoreCardProps` in Task 2 uses `HealthFactor[]` from Task 1 — matches exactly.
- `computeHealthScore` in Task 1 returns `HealthScore` — Task 3 destructures `.score`, `.grade`, `.gradeColor`, `.factors` — all present.
- `buildSparkline` returns `number[]` — Task 2 `sparkline` prop is `number[]` — matches.
