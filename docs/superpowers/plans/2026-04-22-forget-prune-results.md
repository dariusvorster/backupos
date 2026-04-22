# Forget/Prune Results & Manual Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store forget/retention results on every backup run and add a "Prune now" button on the repository page so admins can reclaim disk space on demand.

**Architecture:** Two new nullable integer columns on `backup_runs` capture the forget result after each scheduled backup. A new `pruneRepository` server action (and mirrored tRPC procedure) runs forget per active job using each job's retention policy, falling back to `engine.prune()` when no policy exists. A `PruneButton` client component surfaces the result inline without a page reload.

**Tech Stack:** Drizzle ORM + SQLite migration, ResticEngine (`packages/engine`), tRPC `repositories` router, Next.js server action, React `useTransition` + `useEffect`.

---

## File Map

| File | Change |
|------|--------|
| `packages/db/src/schema.ts` | Add `snapshotsRemoved`, `snapshotsKept` to `backupRuns` |
| `packages/db/migrations/0017_*.sql` | Generated migration (two ADD COLUMN statements) |
| `packages/engine/src/restic.ts` | Add `prune()` method after `forget()` |
| `apps/web/lib/scheduler.ts` | Store `forgetResult.removed/kept` after forget |
| `packages/api/src/router/repositories.ts` | Add `prune` mutation |
| `apps/web/app/actions/repositories.ts` | Add `pruneRepository` server action |
| `apps/web/app/(dashboard)/repositories/[id]/prune-button.tsx` | New client component |
| `apps/web/app/(dashboard)/repositories/[id]/page.tsx` | Import & render `<PruneButton>` |
| `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx` | Add Retention stat card |

---

## Task 1: Schema — add retention columns to `backup_runs`

**Files:**
- Modify: `packages/db/src/schema.ts:139-141`

- [ ] **Step 1: Add two nullable columns to the `backupRuns` table definition**

In `packages/db/src/schema.ts`, find the `backupRuns` table (line ~114). After the `phases` column (currently the last column in the table), add:

```ts
  // Retention (set after forget runs; null means no retention policy was configured)
  snapshotsRemoved: integer('snapshots_removed'),
  snapshotsKept:    integer('snapshots_kept'),
```

The updated end of the table block should look like:

```ts
  log:    text('log'),
  phases: text('phases'),

  // Retention (set after forget runs; null means no retention policy was configured)
  snapshotsRemoved: integer('snapshots_removed'),
  snapshotsKept:    integer('snapshots_kept'),
})
```

- [ ] **Step 2: Generate the Drizzle migration**

```bash
cd packages/db && pnpm db:generate
```

Expected: drizzle-kit prints something like `[✓] Your SQL migration file › migrations/0017_<name>.sql`. The file should contain only two `ALTER TABLE` statements (one per new column). Open it and confirm — if it has anything else (like DROP TABLE or RECREATE), stop and investigate.

- [ ] **Step 3: Apply the migration**

```bash
pnpm db:migrate
```

Expected: `[✓] Migrations applied successfully` (or similar). No errors.

- [ ] **Step 4: Typecheck the db package**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/ && git commit -m "feat(db): add snapshotsRemoved/snapshotsKept to backup_runs"
```

---

## Task 2: ResticEngine — add `prune()` method

**Files:**
- Modify: `packages/engine/src/restic.ts` (after `forget()` method, ~line 168)

- [ ] **Step 1: Add `prune()` after the `forget()` method**

In `packages/engine/src/restic.ts`, locate the closing `}` of the `forget()` method (the last line before `async stats()`). Insert the new method between them:

```ts
  async prune(): Promise<void> {
    const result = await this.run(['prune'])
    if (result.exitCode !== 0) throw new ResticError('prune', result)
  }
```

The section should now read:

```ts
  // ...existing forget() body...
    return {
      removed: entry.remove?.length ?? 0,
      kept:    entry.keep?.length   ?? 0,
    }
  }

  async prune(): Promise<void> {
    const result = await this.run(['prune'])
    if (result.exitCode !== 0) throw new ResticError('prune', result)
  }

  async stats(): Promise<RepoStats> {
```

- [ ] **Step 2: Typecheck the engine package**

```bash
cd packages/engine && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/restic.ts && git commit -m "feat(engine): add prune() method to ResticEngine"
```

---

## Task 3: Scheduler — store forget results

**Files:**
- Modify: `apps/web/lib/scheduler.ts:119-121`

- [ ] **Step 1: Replace the forget call to capture and persist the result**

In `apps/web/lib/scheduler.ts`, find this block (around line 119):

```ts
    if (retentionPolicy) {
      await engine.forget({ ...retentionPolicy, keepTags: tags })
    }
```

Replace it with:

```ts
    if (retentionPolicy) {
      const forgetResult = await engine.forget({ ...retentionPolicy, keepTags: tags })
      await db.update(backupRuns).set({
        snapshotsRemoved: forgetResult.removed,
        snapshotsKept:    forgetResult.kept,
      }).where(eq(backupRuns.id, runId))
    }
```

Note: `backupRuns` and `eq` are already imported at the top of this file.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/scheduler.ts && git commit -m "feat(scheduler): persist forget results on backup run"
```

---

## Task 4: tRPC — `repositories.prune` procedure

**Files:**
- Modify: `packages/api/src/router/repositories.ts`

- [ ] **Step 1: Add missing imports**

At the top of `packages/api/src/router/repositories.ts`, update the DB import line. Currently it reads:

```ts
import { eq } from 'drizzle-orm'
import { repositories, snapshots } from '@backupos/db'
```

Change to:

```ts
import { eq, and } from 'drizzle-orm'
import { repositories, snapshots, backupJobs, backupDefaults } from '@backupos/db'
```

- [ ] **Step 2: Add the `prune` mutation to `repositoriesRouter`**

Find the `delete` mutation near the end of the router object. Add the `prune` mutation after it (before the closing `}` of the `router({...})` call):

```ts
  prune: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [repo] = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.id))
        .limit(1)
      if (!repo) throw new Error('Repository not found')

      const jobs = await ctx.db
        .select()
        .from(backupJobs)
        .where(and(eq(backupJobs.repositoryId, input.id), eq(backupJobs.enabled, true)))
        .all()

      const [defaults] = await ctx.db.select().from(backupDefaults).limit(1).all()

      type Policy = {
        keepLast?: number; keepDaily?: number; keepWeekly?: number
        keepMonthly?: number; keepYearly?: number
      }
      const jobPolicies: Array<{ policy: Policy; tags: string[] }> = []

      for (const job of jobs) {
        const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
        let policy: Policy | null = null

        if (jobHasRetention) {
          policy = {
            keepLast:    job.keepLast    ?? undefined,
            keepDaily:   job.keepDaily   ?? undefined,
            keepWeekly:  job.keepWeekly  ?? undefined,
            keepMonthly: job.keepMonthly ?? undefined,
            keepYearly:  job.keepYearly  ?? undefined,
          }
        } else if (defaults) {
          const defHasAny = defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly
          if (defHasAny) {
            policy = {
              keepLast:    defaults.keepLast    ?? undefined,
              keepDaily:   defaults.keepDaily   ?? undefined,
              keepWeekly:  defaults.keepWeekly  ?? undefined,
              keepMonthly: defaults.keepMonthly ?? undefined,
              keepYearly:  defaults.keepYearly  ?? undefined,
            }
          }
        }

        if (policy) {
          const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
          jobPolicies.push({ policy, tags })
        }
      }

      const cfg = JSON.parse(repo.config) as Record<string, string>
      const engine = new ResticEngine({
        repositoryUrl: cfg['repositoryUrl'] ?? repo.id,
        password:      repo.resticPassword,
        envVars:       cfg,
        binaryPath:    process.env['RESTIC_BINARY_PATH'],
      })

      if (jobPolicies.length === 0) {
        await engine.prune()
        return { removed: 0, kept: 0, jobsProcessed: 0 }
      }

      let totalRemoved = 0
      let totalKept    = 0
      for (const { policy, tags } of jobPolicies) {
        const result = await engine.forget({ ...policy, keepTags: tags })
        totalRemoved += result.removed
        totalKept    += result.kept
      }
      return { removed: totalRemoved, kept: totalKept, jobsProcessed: jobPolicies.length }
    }),
```

- [ ] **Step 3: Typecheck the api package**

```bash
cd packages/api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/router/repositories.ts && git commit -m "feat(api): add repositories.prune tRPC procedure"
```

---

## Task 5: Server action — `pruneRepository`

**Files:**
- Modify: `apps/web/app/actions/repositories.ts` (add import, add function at end of file)

- [ ] **Step 1: Extend the `@backupos/db` import**

At the top of `apps/web/app/actions/repositories.ts`, the DB import currently reads:

```ts
import { getDb, repositories, eq } from '@backupos/db'
```

Change to:

```ts
import { getDb, repositories, backupJobs, backupDefaults, eq, and } from '@backupos/db'
```

- [ ] **Step 2: Append `pruneRepository` to the end of the file**

```ts
export async function pruneRepository(repoId: string): Promise<{
  ok: boolean
  removed?: number
  kept?: number
  jobsProcessed?: number
  error?: string
}> {
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return { ok: false, error: 'Repository not found' }

  try {
    const jobs = await db
      .select()
      .from(backupJobs)
      .where(and(eq(backupJobs.repositoryId, repoId), eq(backupJobs.enabled, true)))
      .all()

    const [defaults] = await db.select().from(backupDefaults).limit(1).all()

    type Policy = {
      keepLast?: number; keepDaily?: number; keepWeekly?: number
      keepMonthly?: number; keepYearly?: number
    }
    const jobPolicies: Array<{ policy: Policy; tags: string[] }> = []

    for (const job of jobs) {
      const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
      let policy: Policy | null = null

      if (jobHasRetention) {
        policy = {
          keepLast:    job.keepLast    ?? undefined,
          keepDaily:   job.keepDaily   ?? undefined,
          keepWeekly:  job.keepWeekly  ?? undefined,
          keepMonthly: job.keepMonthly ?? undefined,
          keepYearly:  job.keepYearly  ?? undefined,
        }
      } else if (defaults) {
        const defHasAny = defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly
        if (defHasAny) {
          policy = {
            keepLast:    defaults.keepLast    ?? undefined,
            keepDaily:   defaults.keepDaily   ?? undefined,
            keepWeekly:  defaults.keepWeekly  ?? undefined,
            keepMonthly: defaults.keepMonthly ?? undefined,
            keepYearly:  defaults.keepYearly  ?? undefined,
          }
        }
      }

      if (policy) {
        const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
        jobPolicies.push({ policy, tags })
      }
    }

    const cfg = JSON.parse(repo.config) as Record<string, string>
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? repoId,
      password:      repo.resticPassword,
      envVars:       cfg,
      binaryPath:    process.env['RESTIC_BINARY_PATH'],
    })

    if (jobPolicies.length === 0) {
      await engine.prune()
      return { ok: true, removed: 0, kept: 0, jobsProcessed: 0 }
    }

    let totalRemoved = 0
    let totalKept    = 0
    for (const { policy, tags } of jobPolicies) {
      const result = await engine.forget({ ...policy, keepTags: tags })
      totalRemoved += result.removed
      totalKept    += result.kept
    }
    return { ok: true, removed: totalRemoved, kept: totalKept, jobsProcessed: jobPolicies.length }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/actions/repositories.ts && git commit -m "feat(actions): add pruneRepository server action"
```

---

## Task 6: PruneButton component + repo page integration

**Files:**
- Create: `apps/web/app/(dashboard)/repositories/[id]/prune-button.tsx`
- Modify: `apps/web/app/(dashboard)/repositories/[id]/page.tsx:88-93`

- [ ] **Step 1: Create `prune-button.tsx`**

```tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { pruneRepository } from '@/app/actions/repositories'

interface PruneResult {
  removed: number
  kept: number
}

export function PruneButton({ repoId }: { repoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult]   = useState<PruneResult | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (result === null) return
    const id = setTimeout(() => setResult(null), 8000)
    return () => clearTimeout(id)
  }, [result])

  function handleClick() {
    setResult(null)
    setError(null)
    startTransition(async () => {
      const res = await pruneRepository(repoId)
      if (res.ok) {
        setResult({ removed: res.removed ?? 0, kept: res.kept ?? 0 })
      } else {
        setError(res.error ?? 'Prune failed')
      }
    })
  }

  const bannerText = result !== null
    ? result.removed === 0
      ? `Pruned: nothing to remove (${result.kept} kept)`
      : `Pruned: ${result.removed} snapshot${result.removed !== 1 ? 's' : ''} removed, ${result.kept} kept`
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Button variant="secondary" size="md" disabled={isPending} onClick={handleClick}>
        {isPending ? 'Pruning…' : 'Prune now'}
      </Button>
      {bannerText && (
        <span style={{ fontSize: 11, color: 'var(--ok)' }}>
          {bannerText}
        </span>
      )}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--err)' }}>
          Prune failed: {error}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Import and render `PruneButton` in the repo page**

In `apps/web/app/(dashboard)/repositories/[id]/page.tsx`, add the import near the top with the other local imports:

```ts
import { PruneButton } from './prune-button'
```

Then find the action button row (around line 88–93):

```tsx
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="md">Browse snapshots</Button>
        </Link>
        <RunCheckButton repoId={id} />
      </div>
```

Change to:

```tsx
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="md">Browse snapshots</Button>
        </Link>
        <RunCheckButton repoId={id} />
        <PruneButton repoId={id} />
      </div>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/repositories/[id]/prune-button.tsx apps/web/app/(dashboard)/repositories/[id]/page.tsx && git commit -m "feat(ui): add Prune now button to repository page"
```

---

## Task 7: Run detail — Retention stat card

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx:80-96`

- [ ] **Step 1: Add the Retention stat to the run detail stats grid**

In `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx`, the stats section (around line 80) renders a grid of stat cards. The existing array is:

```tsx
        {([
          { label: 'Duration',   value: run.duration    != null ? `${run.duration}s`                                    : '—' },
          { label: 'Data added', value: run.dataAdded   != null ? `${(run.dataAdded   / 1_048_576).toFixed(1)} MB`      : '—' },
          { label: 'Total size', value: run.totalSize   != null ? `${(run.totalSize   / 1_073_741_824).toFixed(2)} GB`  : '—' },
          { label: 'Files new',  value: run.filesNew         != null ? String(run.filesNew)         : '—' },
          { label: 'Changed',    value: run.filesChanged     != null ? String(run.filesChanged)     : '—' },
          { label: 'Unmodified', value: run.filesUnmodified  != null ? String(run.filesUnmodified)  : '—' },
        ] as { label: string; value: string }[]).map(({ label, value }) => (
```

Replace with (adds Retention only when non-null):

```tsx
        {([
          { label: 'Duration',   value: run.duration    != null ? `${run.duration}s`                                    : '—' },
          { label: 'Data added', value: run.dataAdded   != null ? `${(run.dataAdded   / 1_048_576).toFixed(1)} MB`      : '—' },
          { label: 'Total size', value: run.totalSize   != null ? `${(run.totalSize   / 1_073_741_824).toFixed(2)} GB`  : '—' },
          { label: 'Files new',  value: run.filesNew         != null ? String(run.filesNew)         : '—' },
          { label: 'Changed',    value: run.filesChanged     != null ? String(run.filesChanged)     : '—' },
          { label: 'Unmodified', value: run.filesUnmodified  != null ? String(run.filesUnmodified)  : '—' },
          ...(run.snapshotsRemoved != null || run.snapshotsKept != null ? [{
            label: 'Retention',
            value: `${run.snapshotsRemoved ?? 0} removed · ${run.snapshotsKept ?? 0} kept`,
          }] : []),
        ] as { label: string; value: string }[]).map(({ label, value }) => (
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors. If TypeScript doesn't know `run.snapshotsRemoved` / `run.snapshotsKept`, confirm that the `packages/db` package was rebuilt after Task 1:

```bash
cd packages/db && pnpm build
```

Then re-run typecheck.

- [ ] **Step 3: Build the web app to confirm no build errors**

```bash
cd apps/web && pnpm build
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx && git commit -m "feat(ui): show retention stat in run detail when forget ran"
```
