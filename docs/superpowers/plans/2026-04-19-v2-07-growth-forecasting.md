# Growth Forecasting (Cost Analytics v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Forecast" card to the repository detail page showing actual storage over the last 90 days, a 12-month forward projection with confidence band, estimated monthly cost, retention-policy plateau estimate, budget-exceeded banner, and four suggestion cards.

**Architecture:** Two new integer columns on `repositories` (`costPerGbMonth` in millicents, `monthlyBudgetCents`) enable per-repo cost configuration. A pure utility library computes linear regression over the last 30 snapshot sizes, projects 12 months forward, estimates when retention policy causes storage to plateau, and formats costs. The repository detail page renders all of this server-side: snapshot history fetched, forecast computed, SVG chart rendered inline. No charting library — SVG only, consistent with the sparkline approach in v2-04.

**Tech Stack:** Next.js 15 App Router server components, TypeScript strict, Drizzle ORM, inline SVG charts, CSS custom properties.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `costPerGbMonth`, `monthlyBudgetCents` to `repositories` |
| `apps/web/lib/growth-forecast.ts` | Create — linear regression, 12-month projection, plateau estimate, cost formatting |
| `apps/web/app/(dashboard)/repositories/[id]/page.tsx` | Modify — add Forecast card with SVG chart, cost display, budget banner, suggestion cards |
| `apps/web/app/actions/repository-cost.ts` | Create — `saveCostConfig(repoId, formData)` server action |

---

### Task 1: DB Schema — cost config columns on repositories

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Find the repositories table**

```bash
grep -n "export const repositories" packages/db/src/schema.ts
```

Read a few lines from that line number to confirm current columns.

- [ ] **Step 2: Add cost columns to `repositories`**

After the `createdAt` column, add:

```typescript
costPerGbMonth:   integer('cost_per_gb_month'),
monthlyBudgetCents: integer('monthly_budget_cents'),
```

`costPerGbMonth` stores cost in millicents per GB per month (e.g. 2300 = $0.023/GB). Null = not configured.
`monthlyBudgetCents` stores the user's budget ceiling in cents (e.g. 1000 = $10.00). Null = no budget set.

- [ ] **Step 3: Generate migration and run against BOTH databases**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
```

- [ ] **Step 4: Rebuild db package**

```bash
pnpm --filter @backupos/db build
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add costPerGbMonth and monthlyBudgetCents to repositories schema"
```

---

### Task 2: Growth Forecast Utility Library

**Files:**
- Create: `apps/web/lib/growth-forecast.ts`

- [ ] **Step 1: Create `apps/web/lib/growth-forecast.ts`**

```typescript
// apps/web/lib/growth-forecast.ts

export interface SnapshotDataPoint {
  date:      Date
  sizeBytes: number
}

export interface ForecastPoint {
  date:      Date
  sizeBytes: number
  lower:     number
  upper:     number
}

export interface GrowthForecast {
  history:         SnapshotDataPoint[]
  forecast:        ForecastPoint[]
  dailyGrowthBytes: number
  plateauMonth:    number | null
  plateauBytes:    number | null
  currentGb:       number
  forecastGb12mo:  number
  currentCostCents:   number | null
  forecast12moCents:  number | null
  budgetExceededMonth: number | null
}

export const BACKEND_PRESETS: Record<string, { label: string; costPerGbMonth: number }> = {
  s3:    { label: 'AWS S3',          costPerGbMonth: 2300  },
  r2:    { label: 'Cloudflare R2',   costPerGbMonth: 1500  },
  b2:    { label: 'Backblaze B2',    costPerGbMonth:  600  },
  sftp:  { label: 'SFTP / Self-hosted', costPerGbMonth: 0  },
  local: { label: 'Local disk',      costPerGbMonth: 0     },
  rclone:{ label: 'Rclone',          costPerGbMonth: 1500  },
}

const MS_PER_DAY = 86_400_000

function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; stdErr: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, stdErr: 0 }

  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n

  let ssXX = 0, ssXY = 0, ssYY = 0
  for (const p of points) {
    ssXX += (p.x - meanX) ** 2
    ssXY += (p.x - meanX) * (p.y - meanY)
    ssYY += (p.y - meanY) ** 2
  }

  const slope     = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = meanY - slope * meanX

  const residuals = points.map(p => p.y - (slope * p.x + intercept))
  const mse       = residuals.reduce((s, r) => s + r ** 2, 0) / Math.max(n - 2, 1)
  const stdErr    = Math.sqrt(mse / ssXX) * Math.sqrt(ssXX + meanX ** 2 / n)

  return { slope, intercept, stdErr }
}

export function computeForecast(
  history:          SnapshotDataPoint[],
  retentionMonths:  number | null,
  costPerGbMonth:   number | null,
  monthlyBudgetCents: number | null,
): GrowthForecast {
  const now     = new Date()
  const t0      = now.getTime()

  // Use up to last 30 snapshots, sorted oldest→newest
  const sorted  = [...history].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-30)

  // Build regression points (x = days from first snapshot, y = sizeBytes)
  const t_first = sorted[0]?.date.getTime() ?? t0
  const points  = sorted.map(s => ({ x: (s.date.getTime() - t_first) / MS_PER_DAY, y: s.sizeBytes }))
  const reg     = linearRegression(points)

  const dailyGrowthBytes = Math.max(0, reg.slope)

  // Build 12-month forecast (one point per month)
  const forecast: ForecastPoint[] = []
  const t_now_days = (t0 - t_first) / MS_PER_DAY
  const baseSize   = reg.slope * t_now_days + reg.intercept

  for (let m = 1; m <= 12; m++) {
    const daysAhead = m * 30.44
    const projected = baseSize + dailyGrowthBytes * daysAhead
    const halfCI    = reg.stdErr * 1.645 * Math.sqrt(daysAhead) // 90% CI
    forecast.push({
      date:      new Date(t0 + daysAhead * MS_PER_DAY),
      sizeBytes: Math.max(0, projected),
      lower:     Math.max(0, projected - halfCI),
      upper:     Math.max(0, projected + halfCI),
    })
  }

  // Plateau estimation: if retention policy limits history, growth flattens
  let plateauMonth: number | null  = null
  let plateauBytes: number | null  = null
  if (retentionMonths !== null && retentionMonths > 0 && dailyGrowthBytes > 0) {
    // Plateau ≈ when oldest-kept snapshot is retentionMonths old → total ≈ retention window × avg daily growth
    const plateauSizeBytes = dailyGrowthBytes * retentionMonths * 30.44
    const monthsToReach    = forecast.findIndex(f => f.sizeBytes >= plateauSizeBytes)
    if (monthsToReach >= 0) {
      plateauMonth = monthsToReach + 1
      plateauBytes = plateauSizeBytes
    }
  }

  const currentGb      = (sorted[sorted.length - 1]?.sizeBytes ?? 0) / 1_073_741_824
  const forecastGb12mo = (forecast[11]?.sizeBytes ?? 0) / 1_073_741_824

  const currentCostCents   = costPerGbMonth !== null ? Math.round(currentGb * costPerGbMonth / 1000) : null
  const forecast12moCents  = costPerGbMonth !== null ? Math.round(forecastGb12mo * costPerGbMonth / 1000) : null

  let budgetExceededMonth: number | null = null
  if (monthlyBudgetCents !== null && costPerGbMonth !== null) {
    const exceededIdx = forecast.findIndex(f => {
      const gb   = f.sizeBytes / 1_073_741_824
      const cost = Math.round(gb * costPerGbMonth / 1000)
      return cost > monthlyBudgetCents
    })
    if (exceededIdx >= 0) budgetExceededMonth = exceededIdx + 1
  }

  return {
    history:         sorted,
    forecast,
    dailyGrowthBytes,
    plateauMonth,
    plateauBytes,
    currentGb,
    forecastGb12mo,
    currentCostCents,
    forecast12moCents,
    budgetExceededMonth,
  }
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function fmtGb(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

export function fmtGbPerMonth(bytesPerDay: number): string {
  const gbPerMonth = (bytesPerDay * 30.44) / 1_073_741_824
  if (gbPerMonth < 0.1) return `< 0.1 GB/mo`
  return `${gbPerMonth.toFixed(1)} GB/mo`
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/growth-forecast.ts
git commit -m "feat: add growth forecast utility library (linear regression, projection, cost calc)"
```

---

### Task 3: Cost Config Server Action

**Files:**
- Create: `apps/web/app/actions/repository-cost.ts`

- [ ] **Step 1: Create `apps/web/app/actions/repository-cost.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, repositories } from '@backupos/db'
import { eq } from 'drizzle-orm'

export async function saveCostConfig(repoId: string, formData: FormData): Promise<void> {
  const costStr   = (formData.get('costPerGbMonth') as string).trim()
  const budgetStr = (formData.get('monthlyBudgetCents') as string).trim()

  const costPerGbMonth     = costStr   === '' ? null : Math.round(parseFloat(costStr) * 1000)
  const monthlyBudgetCents = budgetStr === '' ? null : Math.round(parseFloat(budgetStr) * 100)

  const db = getDb()
  await db.update(repositories)
    .set({ costPerGbMonth, monthlyBudgetCents })
    .where(eq(repositories.id, repoId))
    .run()

  revalidatePath(`/repositories/${repoId}`)
}
```

`costPerGbMonth` input: user enters dollars (e.g. "0.023") → stored as millicents (2300).
`monthlyBudgetCents` input: user enters dollars (e.g. "10.00") → stored as cents (1000).

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/actions/repository-cost.ts
git commit -m "feat: add saveCostConfig server action for repository cost configuration"
```

---

### Task 4: Repository Detail Page — Forecast Card

**Files:**
- Modify: `apps/web/app/(dashboard)/repositories/[id]/page.tsx`

- [ ] **Step 1: Read the current repository detail page**

```bash
cat "apps/web/app/(dashboard)/repositories/[id]/page.tsx"
```

- [ ] **Step 2: Read the snapshots table to understand the query pattern**

```bash
grep -n "export const snapshots\|sizeBytes\|createdAt" packages/db/src/schema.ts | head -20
```

- [ ] **Step 3: Add imports**

```typescript
import { snapshots, backupJobs } from '@backupos/db'
import { desc } from 'drizzle-orm'
import { computeForecast, fmtCents, fmtGb, fmtGbPerMonth, BACKEND_PRESETS } from '@/lib/growth-forecast'
import { saveCostConfig } from '@/app/actions/repository-cost'
import { TrendingUp, AlertTriangle, Info } from 'lucide-react'
```

- [ ] **Step 4: Add data fetching in the server component**

After the existing `repo` fetch, add:

```typescript
// Fetch last 90 days of snapshots for this repo (for growth chart)
const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000)
const recentSnaps   = await db.select({ sizeBytes: snapshots.sizeBytes, createdAt: snapshots.createdAt })
  .from(snapshots)
  .where(eq(snapshots.repositoryId, repo.id))
  .orderBy(desc(snapshots.createdAt))
  .limit(90)
  .all()

// Fetch retention policy from jobs attached to this repo
const jobs = await db.select({
  keepMonthly: backupJobs.keepMonthly,
  keepYearly:  backupJobs.keepYearly,
  keepWeekly:  backupJobs.keepWeekly,
}).from(backupJobs).where(eq(backupJobs.repositoryId, repo.id)).all()

// Estimate effective retention window in months
const maxRetentionMonths = jobs.reduce((max, j) => {
  const months = (j.keepYearly ?? 0) * 12 + (j.keepMonthly ?? 0) + Math.round((j.keepWeekly ?? 0) / 4)
  return Math.max(max, months)
}, 0) || null

const historyPoints = recentSnaps
  .filter(s => s.sizeBytes !== null && s.createdAt !== null)
  .map(s => ({ date: s.createdAt as Date, sizeBytes: s.sizeBytes as number }))

const forecast = computeForecast(
  historyPoints,
  maxRetentionMonths,
  repo.costPerGbMonth ?? null,
  repo.monthlyBudgetCents ?? null,
)

const boundSaveCostConfig = saveCostConfig.bind(null, repo.id)
const preset = BACKEND_PRESETS[repo.backend as keyof typeof BACKEND_PRESETS]
```

- [ ] **Step 5: Render the Forecast card**

Add the following JSX section after the existing repo stats cards:

```tsx
{/* Forecast card */}
<div style={{
  backgroundColor: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '20px 24px',
  marginBottom: 24,
}}>
  {/* Card header */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <TrendingUp size={16} color="var(--accent)" />
    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Growth forecast</span>
  </div>

  {/* Budget exceeded banner */}
  {forecast.budgetExceededMonth !== null && (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, var(--warn) 10%)',
      border: '1px solid var(--warn)',
      borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16,
    }}>
      <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: 'var(--fg)' }}>
        Projected cost will exceed your {fmtCents(repo.monthlyBudgetCents ?? 0)}/mo budget in{' '}
        <strong>{forecast.budgetExceededMonth} month{forecast.budgetExceededMonth !== 1 ? 's' : ''}</strong>.
      </span>
    </div>
  )}

  {/* SVG Chart */}
  {historyPoints.length >= 2 ? (
    (() => {
      const W = 600, H = 140, PAD_L = 48, PAD_R = 16, PAD_T = 8, PAD_B = 24
      const chartW = W - PAD_L - PAD_R
      const chartH = H - PAD_T - PAD_B

      const allPoints = [
        ...forecast.history.map(h => ({ date: h.date, bytes: h.sizeBytes, type: 'actual' as const })),
        ...forecast.forecast.map(f => ({ date: f.date, bytes: f.sizeBytes, type: 'forecast' as const, lower: f.lower, upper: f.upper })),
      ]

      const minDate  = allPoints[0].date.getTime()
      const maxDate  = allPoints[allPoints.length - 1].date.getTime()
      const maxBytes = Math.max(...allPoints.map(p => ('upper' in p ? p.upper : p.bytes))) * 1.1 || 1

      function px(date: Date) { return PAD_L + ((date.getTime() - minDate) / (maxDate - minDate)) * chartW }
      function py(bytes: number) { return PAD_T + chartH - (bytes / maxBytes) * chartH }

      const actualPts   = forecast.history.map(h => `${px(h.date)},${py(h.sizeBytes)}`).join(' ')
      const forecastPts = forecast.forecast.map(f => `${px(f.date)},${py(f.sizeBytes)}`).join(' ')
      const bandPath    = [
        ...forecast.forecast.map((f, i) => `${i === 0 ? 'M' : 'L'}${px(f.date)},${py(f.upper)}`),
        ...forecast.forecast.slice().reverse().map((f, i) => `${i === 0 ? 'L' : 'L'}${px(f.date)},${py(f.lower)}`),
        'Z',
      ].join(' ')

      const yLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
        y:    PAD_T + chartH * (1 - t),
        label: fmtGb(maxBytes * t),
      }))

      return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', marginBottom: 16, overflow: 'visible' }}>
          {/* Y grid lines */}
          {yLabels.map(({ y, label }) => (
            <g key={y}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeDasharray="2,3" />
              <text x={PAD_L - 4} y={y + 4} fontSize={9} fill="var(--fg-dim)" textAnchor="end">{label}</text>
            </g>
          ))}

          {/* Today marker */}
          <line x1={px(new Date())} y1={PAD_T} x2={px(new Date())} y2={PAD_T + chartH} stroke="var(--border)" strokeDasharray="4,3" />

          {/* Confidence band */}
          <path d={bandPath} fill="var(--accent)" fillOpacity={0.1} />

          {/* Actual line */}
          {forecast.history.length >= 2 && (
            <polyline points={actualPts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Forecast line */}
          {forecast.forecast.length >= 2 && (
            <polyline points={forecastPts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4,3" strokeLinecap="round" />
          )}

          {/* Plateau marker */}
          {forecast.plateauMonth !== null && forecast.plateauBytes !== null && (() => {
            const plateauDate = forecast.forecast[forecast.plateauMonth - 1]?.date
            if (!plateauDate) return null
            const xp = px(plateauDate)
            const yp = py(forecast.plateauBytes)
            return (
              <g>
                <line x1={xp} y1={PAD_T} x2={xp} y2={PAD_T + chartH} stroke="var(--ok)" strokeDasharray="3,3" opacity={0.6} />
                <text x={xp + 3} y={PAD_T + 10} fontSize={9} fill="var(--ok)">plateau</text>
              </g>
            )
          })()}
        </svg>
      )
    })()
  ) : (
    <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '20px 0', textAlign: 'center', marginBottom: 16 }}>
      Not enough snapshot history to build a forecast. Run a few backups first.
    </div>
  )}

  {/* Stats row */}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
    {[
      { label: 'Current size',    value: fmtGb(forecast.currentGb * 1_073_741_824) },
      { label: 'Growth rate',     value: fmtGbPerMonth(forecast.dailyGrowthBytes) },
      { label: 'Projected (12mo)', value: fmtGb(forecast.forecastGb12mo * 1_073_741_824) },
    ].map(({ label, value }) => (
      <div key={label} style={{ backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
      </div>
    ))}
  </div>

  {/* Cost row */}
  {forecast.currentCostCents !== null && forecast.forecast12moCents !== null && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, fontSize: 13, color: 'var(--fg-mute)' }}>
      <span>Current estimated cost: <strong style={{ color: 'var(--fg)' }}>{fmtCents(forecast.currentCostCents)}/mo</strong></span>
      <span>→</span>
      <span>Estimated in 12 months: <strong style={{ color: forecast.forecast12moCents > (forecast.currentCostCents * 1.5) ? 'var(--err)' : 'var(--fg)' }}>{fmtCents(forecast.forecast12moCents)}/mo</strong></span>
      {forecast.plateauMonth && (
        <span style={{ fontSize: 12, color: 'var(--ok)' }}>
          Storage plateaus ~month {forecast.plateauMonth} with current retain policy
        </span>
      )}
    </div>
  )}

  {/* Suggestions */}
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Suggestions</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        {
          title:  'Tighten retention policy',
          desc:   'Reducing keep_monthly from 12 to 6 could halve long-term storage growth.',
          action: `/jobs?repo=${repo.id}`,
          label:  'Edit jobs',
        },
        {
          title:  'Switch backend',
          desc:   preset
            ? `You're on ${preset.label}. ${repo.costPerGbMonth !== null && repo.costPerGbMonth > BACKEND_PRESETS['b2'].costPerGbMonth ? `Backblaze B2 at $0.006/GB could save ~${Math.round((1 - BACKEND_PRESETS['b2'].costPerGbMonth / repo.costPerGbMonth) * 100)}%.` : 'Compare costs across S3, R2, B2.'}`
            : 'Compare storage costs across supported backends.',
          action: null,
          label:  null,
        },
        {
          title:  'Enable compression',
          desc:   'Restic compresses by default. Ensure —compression=max is set in your agent config for maximum deduplication benefit.',
          action: null,
          label:  null,
        },
        {
          title:  'Exclude large files',
          desc:   'Identify and exclude frequently changing large files (e.g. VM disk images, log archives) that contribute most to growth.',
          action: null,
          label:  null,
        },
      ].map(s => (
        <div key={s.title} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px',
        }}>
          <Info size={13} color="var(--fg-dim)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{s.desc}</div>
          </div>
          {s.action && s.label && (
            <a href={s.action} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{s.label} →</a>
          )}
        </div>
      ))}
    </div>
  </div>

  {/* Cost config form */}
  <details style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
    <summary style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}>Configure cost & budget</summary>
    <form action={boundSaveCostConfig} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Cost ($/GB/month)</label>
        <input
          name="costPerGbMonth"
          type="number"
          step="0.001"
          min="0"
          defaultValue={repo.costPerGbMonth !== null ? (repo.costPerGbMonth / 1000).toFixed(3) : ''}
          placeholder={preset ? (preset.costPerGbMonth / 1000).toFixed(3) : '0.023'}
          style={{ padding: '5px 8px', fontSize: 12, width: 100, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Monthly budget ($)</label>
        <input
          name="monthlyBudgetCents"
          type="number"
          step="0.01"
          min="0"
          defaultValue={repo.monthlyBudgetCents !== null ? (repo.monthlyBudgetCents / 100).toFixed(2) : ''}
          placeholder="10.00"
          style={{ padding: '5px 8px', fontSize: 12, width: 100, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none' }}
        />
      </div>
      <button type="submit" style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
        Save
      </button>
    </form>
  </details>
</div>
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -40
```

Fix any errors. Common issues:
- `repo.costPerGbMonth` is `number | null` from Drizzle — use `?? null` coercions as shown
- `repo.backend` may need `as keyof typeof BACKEND_PRESETS` — add cast
- `snapshots` needs to be imported if not already
- `eq` and `desc` need to be imported from `drizzle-orm`

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(dashboard)/repositories/[id]/page.tsx"
git commit -m "feat: add growth forecast card to repository detail page"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.6) | Task |
|---|---|
| Line chart: actual storage last 90 days | Task 4 (SVG chart, history series) |
| Line chart: forecast next 12 months with confidence band | Task 4 (SVG chart, dashed forecast + shaded band) |
| Cost forecast (current vs 12mo) | Tasks 1+2+4 (costPerGbMonth column + fmtCents) |
| Retention policy plateau estimate | Task 2 (computeForecast plateau logic) + Task 4 (plateau marker on chart) |
| Budget exceeded banner | Task 4 (AlertTriangle banner) |
| Suggestion: Tighten retention policy | Task 4 (suggestions array) |
| Suggestion: Switch backend | Task 4 (BACKEND_PRESETS comparison) |
| Suggestion: Enable compression | Task 4 (suggestions array) |
| Suggestion: Exclude large files | Task 4 (note — no agent data, text suggestion only) |

### Placeholder scan

No TBD/TODO. "Exclude large files" is implemented as a text suggestion (no live file data — noted as requiring agent integration).

### Type consistency

- `computeForecast` takes `SnapshotDataPoint[]` with `{ date: Date; sizeBytes: number }` — Task 4 maps `recentSnaps` with `s.createdAt as Date` and `s.sizeBytes as number` (both confirmed present in schema).
- `BACKEND_PRESETS` keyed by `backend` string — Task 4 casts `repo.backend as keyof typeof BACKEND_PRESETS`.
- `fmtCents(cents: number)` called with `forecast.currentCostCents` which is `number | null` — guarded by the `!== null` check block.
- `saveCostConfig.bind(null, repo.id)` matches `saveCostConfig(repoId: string, formData: FormData)` — consistent.
