# Forget/Prune Results & Manual Prune — Design Spec

## Goal

Surface retention results in backup run history and add a "Prune now" button on the repository page so admins can immediately reclaim disk space.

## Architecture

The scheduler already calls `engine.forget()` after each successful backup but discards the result. This feature stores that result in the run record and exposes it in the UI. A new tRPC procedure handles on-demand pruning at the repository level by running forget per active job using each job's own retention policy.

## Tech Stack

- Drizzle ORM + SQLite migration (two new nullable integer columns)
- ResticEngine (`packages/engine`) — new `prune()` method
- tRPC `repositories.prune` procedure (`packages/api`)
- Next.js App Router — repository page client component updated

---

## Section 1 — Data Layer

### New columns on `backup_runs`

| column | type | nullable | purpose |
|--------|------|----------|---------|
| `snapshots_removed` | integer | yes | how many snapshots the forget step deleted |
| `snapshots_kept` | integer | yes | how many snapshots were kept after forget |

Both default to `null`. A null value means no forget step ran for that run (no retention policy was configured). `0` means forget ran but nothing was pruned.

A Drizzle migration is generated from the schema change and applied.

### New `engine.prune()` method (`packages/engine/src/restic.ts`)

Runs `restic prune --json` with no `--keep-*` flags — reclaims pack storage from already-forgotten snapshots without removing any new ones. Used as a fallback when no retention policy is configured for any job in a repo.

```ts
async prune(): Promise<void> {
  const result = await this.run(['prune'])
  if (result.exitCode !== 0) throw new ResticError('prune', result)
}
```

---

## Section 2 — Scheduler Update

In `apps/web/lib/scheduler.ts`, after `engine.forget()` succeeds, immediately update the run record with the result:

```ts
const forgetResult = await engine.forget({ ...retentionPolicy, keepTags: tags })
await db.update(backupRuns).set({
  snapshotsRemoved: forgetResult.removed,
  snapshotsKept:    forgetResult.kept,
}).where(eq(backupRuns.id, runId))
```

If `retentionPolicy` is null (no policy found), neither column is written — they remain null for that run.

The forget step stays inside the existing try/catch, so a forget failure still marks the run as failed with an error message.

---

## Section 3 — tRPC Procedure

**`repositories.prune({ id })`** — `authedProcedure`

1. Load repo from DB by `id` — throw `NOT_FOUND` if missing
2. Load all enabled jobs for this repo (`eq(backupJobs.repositoryId, id)`)
3. Build a `RetentionPolicy | null` per job:
   - Job has at least one keep field set → use job's policy
   - Else → load global `backupDefaults`, use those if any keep field is set
   - Else → null (no policy)
4. Build a single `ResticEngine` from the repo config
5. If at least one job has a non-null policy:
   - For each such job, call `engine.forget({ ...policy, keepTags: [job tag] })`
   - Accumulate `removed` and `kept` totals
6. If no jobs have any policy: call `engine.prune()`, return `{ removed: 0, kept: 0, jobsProcessed: 0 }`
7. Return `{ removed: number, kept: number, jobsProcessed: number }`

---

## Section 4 — Repository Page UI

### "Prune now" button

Added to the repository page header area, alongside the existing "Run check" button.

**States:**
- Idle: `"Prune now"` button, ghost style
- Running: spinner icon + `"Pruning…"` text, button disabled
- Success: inline result banner below the header — `"Pruned: 3 snapshots removed, 47 kept"` (dismissible, auto-hides after 8 s)
- Zero removal: `"Pruned: nothing to remove (47 kept)"` — same banner, no alarm
- Error: red inline message — `"Prune failed: <error message>"`

No page reload. Uses `useTransition` + tRPC mutation.

### Run history display

In the run history row (or run detail view), when `snapshotsRemoved` or `snapshotsKept` is non-null, add a "Retention" stat:

```
Retention   3 removed · 47 kept
```

When both columns are null (no forget ran), the row is hidden. Shown in the same style as existing run stats (files new, data added, duration).

---

## Error Handling

- Repo not found → `NOT_FOUND` tRPC error
- Engine error (restic process fails) → tRPC `INTERNAL_SERVER_ERROR` with restic stderr
- Forget error in scheduler → existing behaviour: run marked `failed`, `errorMessage` stored
- `engine.prune()` failure → surfaced as tRPC error to the client

## Out of Scope

- Storing per-job forget results separately (only aggregate on the repo prune endpoint)
- Scheduling standalone prune runs independently of backup jobs
- UI showing which specific snapshots were removed
