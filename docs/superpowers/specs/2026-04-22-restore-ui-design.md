# Restore UI Enhancements — Design Spec

## Goal

Three targeted improvements to the restore section: a run detail page showing step-by-step logs, live status polling while a restore is running, and a snapshot picker on the "Run now" button so admins can restore from any point in time.

## Architecture

No new DB columns. All three features work with existing data: `run.log` (already stores step results as JSON), `run.status` (drives polling stop condition), and the existing `repositories.snapshots` tRPC query (feeds the picker). A single new server action covers snapshot-specific runs. Three new files, three modified.

## Tech Stack

- Next.js App Router (server components + `'use client'` components)
- `router.refresh()` for live polling (no WebSockets, no SSE)
- tRPC `repositories.snapshots` query (existing)
- React `useState`, `useTransition`, `useEffect`

---

## Section 1 — File Map

| File | Change |
|------|--------|
| `apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx` | Create: run detail server component |
| `apps/web/app/(dashboard)/restore/[id]/run-split-button.tsx` | Create: split button + snapshot picker modal |
| `apps/web/app/(dashboard)/restore/[id]/runs/poll-wrapper.tsx` | Create: client-side polling component |
| `apps/web/app/(dashboard)/restore/[id]/runs/page.tsx` | Modify: clickable rows + mount PollWrapper |
| `apps/web/app/(dashboard)/restore/[id]/page.tsx` | Modify: swap RunNowButton → RunSplitButton |
| `apps/web/app/actions/restore.ts` | Modify: add `runSpecWithSnapshot` server action |

`run-button.tsx` is left in place (not deleted — `RunNowButton` may be referenced elsewhere). `RunSplitButton` is a separate component.

---

## Section 2 — Run Detail Page

**Route:** `/restore/[id]/runs/[runId]`

**File:** `apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx`

Server component. Loads the run record by `runId`, 404s if missing. Loads the parent spec by `id` for the breadcrumb. Parses `run.log` as `StepResult[]` using a safe JSON parse (returns `[]` if null/malformed).

**Layout:**
```
← Postgres DR / Run history

Run <runId[:8]>                        [status badge]
Started: 2025-04-22 14:01 · Duration: 4.1s · Snapshot: abc12345

Steps
  ✓  Step name                        0.8s
     command output (stdout/stderr)

  ✗  Step name                        0.1s
     error output in red
```

Step rendering:
- Green `✓` / red `✗` icon based on `step.success`
- Step name + duration from `step.name` and `step.duration`
- Output block shows `step.output` (stdout+stderr combined) in a monospace pre element
- Failed step output uses `color: var(--err)`

If `run.status === 'running'` and the steps array is empty, show a spinner placeholder ("Restore in progress…") instead of the steps section. If `run.status === 'running'` and steps exist (partial), show steps so far with a spinner appended.

Mount `<PollWrapper initialStatus={run.status} />` when `run.status === 'running'`.

---

## Section 3 — Live Polling

**File:** `apps/web/app/(dashboard)/restore/[id]/runs/poll-wrapper.tsx`

`'use client'` component. Props: `initialStatus: string`.

Behaviour:
- If `initialStatus !== 'running'`: renders nothing, no effect.
- If `initialStatus === 'running'`: calls `router.refresh()` every 3 000 ms via `setInterval`.
- Cleanup: `clearInterval` on unmount.
- Network failures in `router.refresh()` are ignored (silent — page just doesn't update that tick).

**Usage on runs list page** (`/restore/[id]/runs/page.tsx`):
- After fetching runs, compute `const hasRunning = runs.some(r => r.status === 'running')`
- Mount `<PollWrapper initialStatus={hasRunning ? 'running' : 'done'} />`
- Make each run row a `<Link href={/restore/${id}/runs/${run.id}}>` so rows are clickable

**Usage on run detail page:**
- Mount `<PollWrapper initialStatus={run.status} />` so the detail page also auto-refreshes

---

## Section 4 — Snapshot Picker (Split Button)

**File:** `apps/web/app/(dashboard)/restore/[id]/run-split-button.tsx`

`'use client'` component. Props: `specId: string`, `repositoryId: string | null`.

**Structure:**
```
[  Run now  | ▾ ]
```

Left half: `onClick` → `startTransition(() => runSpec(specId))` — identical to current `RunNowButton`.

Right half (▾): toggles a small dropdown anchored below the button:
- "Run with latest" → same as left half
- "Choose snapshot…" → opens the picker modal, closes dropdown

**Picker modal:**

Full-screen dim overlay (`position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.5)`). Centred card (max-width 480px).

Flow A — spec has `repositoryId`:
1. Modal opens → immediately fetches snapshots via `trpc.repositories.snapshots.useQuery({ id: repositoryId })` (or equivalent server action)
2. Shows a scrollable list of snapshots: `<shortId> · <date> · <sizeBytes formatted>`
3. User clicks a row to select it (highlighted)
4. "Run" button: `startTransition(() => runSpecWithSnapshot(specId, selectedSnapshotId))`
5. On success: modal closes, page redirects to runs page (server action calls `redirect`)

Flow B — no `repositoryId`:
1. Modal opens → shows a `<select>` loaded with all repositories (fetched via server action or tRPC)
2. On repo selection → loads that repo's snapshots (same list as Flow A)
3. Rest of flow identical to Flow A

**Modal states:**
- Loading: spinner in list area
- Error fetching snapshots: "Failed to load snapshots. Retry." link
- No snapshots: "No snapshots found in this repository."
- Running (after submit): "Run" button shows "Starting…", disabled

**`runSpecWithSnapshot` server action** (added to `app/actions/restore.ts`):

```ts
export async function runSpecWithSnapshot(
  specId: string,
  snapshotId: string,
): Promise<void>
```

Identical to `runSpec` but takes an explicit `snapshotId` instead of `'latest'`. No change to the run insertion or execution logic.

---

## Section 5 — Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `run.log` null or malformed JSON | Steps section shows "No log available" |
| Run is `'running'` with no steps yet | Spinner placeholder: "Restore in progress…" |
| Snapshot fetch fails in modal | Inline error with Retry link |
| `runSpecWithSnapshot` fails | Server action returns `{ error }`, modal shows it inline |
| `router.refresh()` network error | Silent — next tick retries |

## Out of Scope

- Cancelling a running restore run
- Scheduling restores
- Step marketplace (disabled button stays disabled)
- Per-step retry
