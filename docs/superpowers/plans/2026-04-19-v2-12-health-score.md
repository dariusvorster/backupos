# Health Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two missing score factors (restore verification + Infra OS service coverage) to the existing health score computation, and wire them through from the dashboard data fetch.

**Architecture:** `apps/web/lib/health-score.ts` already exists with `computeHealthScore` and `buildSparkline`. The dashboard already fetches `passedVerifications7d` and `verifiedJobIds` but never passes them to `computeHealthScore`. The `HealthScoreCard` component and modal are complete. This plan adds `verifiedJobs`, `totalVerifiableJobs`, `totalInfraServices`, and `coveredInfraServices` to `HealthScoreInput`, re-balances factor weights, then wires the new inputs from the dashboard.

**Tech Stack:** Next.js 15, TypeScript strict, existing `apps/web/lib/health-score.ts` + `apps/web/app/(dashboard)/dashboard/page.tsx`.

---

## File Map

| File | Action |
|---|---|
| `apps/web/lib/health-score.ts` | Modify — add verification + infra coverage factors, rebalance weights |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Modify — pass `verifiedJobIds.size`, `enabledJobs`, infra coverage to `computeHealthScore` |

---

### Task 1: Update health-score.ts — add verification + infra coverage factors

**Files:**
- Modify: `apps/web/lib/health-score.ts`

The current file is at `/Users/dariusvorster/Projects/backupos/apps/web/lib/health-score.ts`.

Current `HealthScoreInput`:
```typescript
export interface HealthScoreInput {
  enabledJobs: number
  jobsWithSuccessIn24h: number
  totalRepos: number
  reposWithRecentCheck: number
  totalAgents: number
  onlineAgents: number
  openAlerts: number
}
```

Current weights: Jobs backed up 40%, Repos checked 20%, Agents online 20%, Open alerts 20%.

- [ ] **Step 1: Read the current file**

```bash
cat /Users/dariusvorster/Projects/backupos/apps/web/lib/health-score.ts
```

- [ ] **Step 2: Replace the file with the updated implementation**

Write the complete updated `apps/web/lib/health-score.ts`:

```typescript
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
  verifiedJobs: number          // jobs with a passing restore test in last 7d
  totalInfraServices: number    // total registered Infra OS services (0 = no integration)
  coveredInfraServices: number  // services that have at least one backup job
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
    : Math.min(100, Math.round((input.jobsWithSuccessIn24h / input.enabledJobs) * 100))

  const repoScore = input.totalRepos === 0
    ? 100
    : Math.min(100, Math.round((input.reposWithRecentCheck / input.totalRepos) * 100))

  const agentScore = input.totalAgents === 0
    ? 100
    : Math.min(100, Math.round((input.onlineAgents / input.totalAgents) * 100))

  const alertScore = Math.max(0, 100 - input.openAlerts * 20)

  const verifyScore = input.enabledJobs === 0
    ? 100
    : Math.min(100, Math.round((input.verifiedJobs / input.enabledJobs) * 100))

  const hasInfra    = input.totalInfraServices > 0
  const infraScore  = hasInfra
    ? Math.min(100, Math.round((input.coveredInfraServices / input.totalInfraServices) * 100))
    : 100

  // Weights sum to 100. Infra factor is included only when services are registered;
  // its weight is redistributed proportionally when absent.
  const baseFactors: HealthFactor[] = [
    {
      label: 'Jobs backed up (24h)',
      score: jobScore,
      weight: 30,
      value: `${input.jobsWithSuccessIn24h} / ${input.enabledJobs}`,
      detail: jobScore === 100
        ? 'All enabled jobs ran successfully'
        : `${input.enabledJobs - input.jobsWithSuccessIn24h} job(s) missed their last run`,
    },
    {
      label: 'Restore verified (7d)',
      score: verifyScore,
      weight: 20,
      value: `${input.verifiedJobs} / ${input.enabledJobs}`,
      detail: verifyScore === 100
        ? 'All enabled jobs have a passing restore test'
        : `${input.enabledJobs - input.verifiedJobs} job(s) lack a passing restore verification`,
    },
    {
      label: 'Repositories checked (7d)',
      score: repoScore,
      weight: 15,
      value: `${input.reposWithRecentCheck} / ${input.totalRepos}`,
      detail: repoScore === 100
        ? 'All repositories have a recent integrity check'
        : `${input.totalRepos - input.reposWithRecentCheck} repo(s) not checked in 7 days`,
    },
    {
      label: 'Agents online',
      score: agentScore,
      weight: 15,
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

  const factors: HealthFactor[] = hasInfra
    ? [
        ...baseFactors.map(f => ({ ...f, weight: Math.round(f.weight * 0.9) })),
        {
          label: 'Services with backups',
          score: infraScore,
          weight: 10,
          value: `${input.coveredInfraServices} / ${input.totalInfraServices}`,
          detail: infraScore === 100
            ? 'All registered services have a backup job'
            : `${input.totalInfraServices - input.coveredInfraServices} service(s) lack backup coverage`,
        },
      ]
    : baseFactors

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  const score = Math.round(
    factors.reduce((acc, f) => acc + f.score * f.weight, 0) / totalWeight,
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

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | head -20
```

Expected: errors about `computeHealthScore` call in `dashboard/page.tsx` missing the new fields — that's correct, Task 2 will fix them.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/lib/health-score.ts
git commit -m "feat: add verification + infra coverage factors to health score"
```

---

### Task 2: Wire new health score inputs from dashboard

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Read the current dashboard page**

Read `apps/web/app/(dashboard)/dashboard/page.tsx` to locate:
- The `computeHealthScore` call (~line 113)
- The `verifiedJobIds` variable (~line 108)
- The `infraOsServices` import (already present from v2-11)

- [ ] **Step 2: Add infra coverage computation**

The dashboard already has `jobs` (all backup jobs) and `infraOsServices` query from v2-11. After the existing `verifiedJobIds` / `verifiedPct` lines, add:

```typescript
  const coveredInfraServiceIds = new Set(
    jobs.map(j => j.infraServiceId).filter((id): id is string => id !== null && id !== undefined)
  )
  const allServices = await db.select({ id: infraOsServices.id }).from(infraOsServices).all()
  const coveredInfraServices = allServices.filter(s => coveredInfraServiceIds.has(s.id)).length
```

- [ ] **Step 3: Update the computeHealthScore call**

Find the existing call:
```typescript
  const healthScore = computeHealthScore({
    enabledJobs,
    jobsWithSuccessIn24h: jobsWithSuccess24h,
    totalRepos: repos.length,
    reposWithRecentCheck,
    totalAgents: allAgents.length,
    onlineAgents: agentsOnline,
    openAlerts: openAlerts.length,
  })
```

Replace with:
```typescript
  const healthScore = computeHealthScore({
    enabledJobs,
    jobsWithSuccessIn24h: jobsWithSuccess24h,
    totalRepos: repos.length,
    reposWithRecentCheck,
    totalAgents: allAgents.length,
    onlineAgents: agentsOnline,
    openAlerts: openAlerts.length,
    verifiedJobs: verifiedJobIds.size,
    totalInfraServices: allServices.length,
    coveredInfraServices,
  })
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | head -20
```

Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: wire verification + infra coverage into health score"
```

---

## Self-Review

### Spec coverage (§1.11)

| Spec requirement | Task |
|---|---|
| Dashboard hero: big score with letter grade | ✅ Already implemented in HealthScoreCard |
| Click to open breakdown modal | ✅ Already implemented |
| Historical sparkline below score (last 30 days) | ✅ Already implemented |
| Grade turns red if drops below C | ✅ Already implemented (gradeColor: var(--err) for D and F) |
| % of jobs with successful run in last 24h × weight | ✅ Already in computeHealthScore |
| % of repos with recent integrity check × weight | ✅ Already in computeHealthScore |
| % of jobs with passing restore verification × weight | Task 1 (new verifyScore factor) |
| % of critical services with backup job × weight | Task 1 (new infraScore factor) |
| Number of open alerts (negative) | ✅ Already in computeHealthScore |
| Agent online % × weight | ✅ Already in computeHealthScore |

### Placeholder scan

No TBD/TODO. Weight redistribution when infra is absent uses `totalWeight` as divisor, so the sum always normalises correctly even if individual weights are non-round numbers after the `* 0.9` scaling.

### Type consistency

- `HealthScoreInput.verifiedJobs: number` — passed as `verifiedJobIds.size` (Set.size is number) ✅
- `HealthScoreInput.totalInfraServices: number` — passed as `allServices.length` ✅
- `HealthScoreInput.coveredInfraServices: number` — passed as `coveredInfraServices` (filter().length) ✅
- `computeHealthScore` return type `HealthScore` is unchanged — `HealthScoreCard` props are unchanged ✅
