# BackupOS UI Design Spec v1

Matches ProxyOS v3 shell conventions within the Homelab OS Family system. Drop this into Claude Code as the authoritative UI reference. Amber accent (#F5A623) replaces ProxyOS purple; everything else is shared.

---

## 1. Design tokens

### 1.1 Colour tokens (dark mode, `.dark` on `html`)

```css
:root.dark {
  /* Surfaces — identical to MxWatch / ProxyOS */
  --bg:       #0A0A0A;     /* page background */
  --bg2:      #0F0F0F;     /* sidebar, topbar */
  --surf:     #141414;     /* cards, panels */
  --surf2:    #1A1A1A;     /* inputs, hovered rows, nested surfaces */

  /* Borders */
  --border:   #242424;     /* default hairline */
  --border2:  #2E2E2E;     /* emphasised hairline (card headers) */

  /* Text */
  --fg:       #EDEDED;     /* primary */
  --fg-mute:  #9A9A9A;     /* secondary / labels */
  --fg-dim:   #6B6B6B;     /* tertiary / placeholder */
  --fg-faint: #444444;     /* disabled */

  /* Accent — BackupOS amber */
  --accent:      #F5A623;
  --accent-fg:   #000000;       /* text on solid accent */
  --accent-dim:  rgba(245, 166, 35, 0.12);   /* active nav fill */
  --accent-ring: rgba(245, 166, 35, 0.28);   /* focus ring */
  --accent-deep: #854F0B;       /* pressed state / dark fills */

  /* Semantic — identical across all OS Family products */
  --ok:      #00C896;   --ok-dim:     rgba(0, 200, 150, 0.12);
  --warn:    #F5A623;   --warn-dim:   rgba(245, 166, 35, 0.12);
  --err:     #E5484D;   --err-dim:    rgba(229, 72, 77, 0.12);
  --info:    #4A9EFF;   --info-dim:   rgba(74, 158, 255, 0.12);

  /* Note: BackupOS accent overlaps with --warn.
     For status badges use --warn; for brand/interactive use --accent.
     Resolve visually by context — never put a warn badge on an accent button. */
}
```

Light mode uses the same structure; invert the surfaces and keep semantic hues. V1 ships dark-only; light theme scaffolded but disabled behind a flag.

### 1.2 Typography

- **Inter** — all prose, headings, nav, buttons
- **IBM Plex Mono** — snapshot IDs, file paths, repo names, sizes, durations, timestamps, restic commands, hashes

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, monospace;

--text-xs:   11px / 1.4    /* labels, metadata */
--text-sm:   13px / 1.45   /* body default, table cells */
--text-base: 14px / 1.5    /* form inputs */
--text-md:   15px / 1.5    /* card titles */
--text-lg:   18px / 1.35   /* page section headers */
--text-xl:   22px / 1.3    /* page titles */
--text-2xl:  28px / 1.25   /* dashboard hero numbers */
```

Weights: 400 body, 500 emphasis, 600 headings. Never 700.

### 1.3 Spacing, radius, shadow

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px; --space-12: 48px;

--radius-sm: 8px;   /* inputs, badges, small buttons */
--radius:    12px;  /* cards, modals, dropdown panels */
--radius-lg: 16px;  /* logo mark, hero tiles */

--shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
--shadow:    0 4px 16px rgba(0,0,0,0.5);
--shadow-lg: 0 12px 48px rgba(0,0,0,0.6);
```

### 1.4 Logo mark

**BackupOS Grid Shield** — same construction family as ProxyOS Grid Pivot:
- 48×48 canvas, rx=16, background #1A1206
- Four quadrants meeting at a bright centre, amber palette:
  - top-left    #F5A623
  - top-right   #854F0B
  - bottom-left #854F0B
  - bottom-right #C77A14
  - centre square #FEF5E0 (same white-point as ProxyOS)
- The centre square is 40% of canvas width, perfectly centred

---

## 2. Shell layout

Identical structure to ProxyOS. Sidebar 240px, topbar 56px, content fills rest.

### 2.1 Sidebar (240px, `--bg2`)

Top to bottom:

1. **Logo row** — 56px tall, mark + "BackupOS" wordmark, **no bottom border**
2. **Primary nav** — grouped, icon + label, 36px row height
3. Flex spacer
4. **Icon row** — settings · theme · logout, left-aligned, 32px icons, no border above
5. **Avatar row** — circular initial avatar (no ring) + full name, 14px
6. **Tier · version subline** — 11px `--fg-dim`, `Solo · v0.4.0` format

No border-bottom on logo row. No border-top above the bottom stack. Active nav = `--accent-dim` fill only, no right-border indicator.

### 2.2 Primary nav groups

```
OVERVIEW
  • Dashboard
  • Activity

BACKUP
  • Jobs
  • Schedules
  • Snapshots

INFRASTRUCTURE
  • Agents
  • Repositories
  • Monitors            (third-party: PBS, Borg, Duplicati)

RESTORE
  • Restore specs
  • Restore runs

ADMIN
  • Alerts
  • Audit log
  • Settings            (bottom icon, not in list)
```

Group labels: 11px, `--fg-dim`, uppercase, letter-spacing 0.08em, `--space-3` top padding, `--space-1` bottom.

### 2.3 Topbar (56px, `--bg2`, border-bottom `--border`)

- **Left:** breadcrumb (e.g. `Jobs / nightly-postgres / Runs`) — 13px, segments in `--fg-mute`, current in `--fg`
- **Centre:** global search (⌘K trigger shown as keyboard hint) — 320px wide, `--surf` fill
- **Right:** environment switcher (if >1 env), notification bell with dot indicator
- **No avatar in topbar** — avatar lives in sidebar only

### 2.4 Content area

- Max width: 1440px, centred, `--space-8` horizontal padding
- Page title row: 64px tall, `--text-xl` title + optional primary action button (right)
- Section spacing: `--space-8` between top-level sections

---

## 3. Component patterns

### 3.1 Cards

```
Default card:
- Background: --surf
- Border: 1px solid --border
- Radius: --radius (12px)
- Padding: --space-5 (20px)
- Header row: --text-md title, --fg; optional action on right

Stat card (dashboard KPIs):
- Same chrome
- Label: --text-xs --fg-mute uppercase 0.08em
- Value: --text-2xl, --fg, IBM Plex Mono for numeric
- Delta: --text-xs, --ok or --err, with ↑ / ↓ glyph
```

### 3.2 Buttons

| Variant | Use | Style |
|---|---|---|
| Primary | Confirm, create, run backup | `--accent` fill, `--accent-fg` text |
| Secondary | Cancel, edit | `--surf2` fill, `--fg`, `--border` 1px |
| Ghost | Table row actions | transparent, `--fg-mute`, hover `--surf2` |
| Danger | Delete, forget snapshot, prune | `--err` fill, white text |
| Icon | Inline actions | 32px, `--fg-mute`, hover `--fg` |

Heights: sm 28px / md 36px (default) / lg 44px. Radius `--radius-sm`. No 700-weight text on buttons — 500.

### 3.3 Tables

- Header row: `--bg2`, 13px `--fg-mute`, 500 weight, `--space-3` vertical padding
- Data rows: `--surf` (odd) and `--surf` (even) — no stripes; separator is 1px `--border` between rows
- Row hover: `--surf2`
- Selected row: `--accent-dim` left 2px border + subtle `--accent-dim` row tint
- Status column always first after identifier
- Numeric columns right-aligned, mono font
- Timestamps mono, relative format default (`2h ago`), absolute on hover

### 3.4 Badges (status pills)

```
Height: 22px  ·  Padding: 0 --space-2  ·  Radius: 999px  ·  Font: 11px 500

healthy / success  → --ok-dim  bg, --ok text
running            → --info-dim bg, --info text, pulse dot
warning / missed   → --warn-dim bg, --warn text
failed / error     → --err-dim  bg, --err text
idle / paused      → --surf2     bg, --fg-mute text
verifying          → --accent-dim bg, --accent text
```

Each badge has a 6px dot before the label when space allows.

### 3.5 Forms

- Input height: 36px, `--surf2` fill, 1px `--border`, radius `--radius-sm`
- Focus: 2px `--accent-ring` outline (outside border), no inner glow
- Label: 13px `--fg-mute` 500, `--space-2` gap to input
- Helper text: 12px `--fg-dim` below
- Error text: 12px `--err` below, replaces helper
- Inline validation icon inside input on right (8px padding)

### 3.6 Modals

- Overlay: `rgba(0,0,0,0.6)`, backdrop-blur 4px
- Panel: `--surf`, `--radius`, `--shadow-lg`, max-width 560px default
- Header: 60px, `--text-md` title, close X on right
- Body: `--space-6` padding
- Footer: right-aligned actions, `--bg2` strip with top `--border`
- Destructive modals get `--err` accent on confirm button + warning icon beside title

### 3.7 Empty states

Three tiers depending on context:

1. **Inline empty** (inside a card with data expected): icon 32px `--fg-dim`, one-line message `--fg-mute`, one action link `--accent`
2. **Page empty** (first-run): icon 48px `--fg-dim`, `--text-lg` headline, `--text-sm` `--fg-mute` description (2 lines max), primary + secondary action buttons
3. **Filtered empty** (search returned nothing): no icon, "No results for `<query>`" `--fg-mute`, "Clear filters" ghost button

---

## 4. Page-by-page layout

### 4.1 Dashboard

```
┌─ Page title: Dashboard ───────────────────────── [Run backup ▾] ┐
│                                                                  │
│  ┌────────┬────────┬────────┬────────┐                          │
│  │ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4  │   4-col grid, equal      │
│  └────────┴────────┴────────┴────────┘                          │
│                                                                  │
│  ┌────────────────────────┬─────────────────────┐              │
│  │ Recent runs            │ Storage by repo      │              │
│  │ (last 20, live-updating)│ (bar list)          │              │
│  │                        │                     │              │
│  └────────────────────────┴─────────────────────┘              │
│                                                                  │
│  ┌──────────────────────────────────────────────┐              │
│  │ Upcoming schedules (next 24h)                │              │
│  │                                              │              │
│  └──────────────────────────────────────────────┘              │
│                                                                  │
│  ┌──────────────────────────────────────────────┐              │
│  │ Alerts (open)                                │              │
│  └──────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

**KPIs (left to right):**
1. Protected data — total bytes across all repos, green delta vs last week
2. Last 24h — `42 runs · 40 ok · 2 failed` tri-colour split bar
3. Repository health — `3 / 3 healthy` with last check time
4. Monthly storage cost — estimated USD, recommendation link if savings available

**Recent runs card:** table with columns `status · job · target · duration · size · age`. Row click → run detail drawer.

**Storage by repo card:** horizontal bars, repo name + backend badge (R2/B2/Local), used/quota with % fill. Colour fill uses `--info` under 70%, `--warn` 70–90%, `--err` above 90%.

**Upcoming schedules:** timeline strip showing next 24h, job names plotted on timeline. Hover → tooltip with full schedule.

**Alerts:** list of open alerts, severity badge + rule name + first-fired time + acknowledge button.

**Empty (first run):** centered empty state, "No backups yet. Enrol your first agent to get started." → [Enrol agent] primary + [Skip to demo data] ghost.

---

### 4.2 Activity

Infinite-scroll feed, reverse chronological. Each entry:

```
[icon] [timestamp mono] [actor] [verb] [target]          [→]
       2m ago           darius   ran    nightly-postgres
```

Filter rail on right (240px): entity type, actor, severity, date range. Filters as chips above the feed once applied.

**Empty:** page empty state, "No activity in the last 30 days."

---

### 4.3 Jobs

**List view (default):**

Table columns: `status · name · sources · schedule · repo · last run · next run · size · actions`

- `status` — badge (healthy / running / failed / paused / idle)
- `name` — `--fg`, mono monospace, click opens detail
- `sources` — `filesystem +2` condensed format, tooltip shows full list
- `schedule` — cron expression in mono, human-readable tooltip
- `repo` — repository name + backend badge
- `last run` / `next run` — relative mono
- `size` — latest snapshot size, mono
- `actions` — ghost icon buttons: Run now · Edit · Pause · ⋯

Top bar: search + filter chips (status, repo, source type) + [+ New job] primary.

**Detail view** (`/jobs/[id]`):

Three tabs: **Overview · Runs · Settings**

- **Overview tab:** hero row with job status + next run + quick action buttons. Two-col: left = source config summary, right = retention policy + app hooks
- **Runs tab:** full run history table, click row → run drawer with live log stream for active runs, restic output for completed
- **Settings tab:** full job editor form in sections (Sources, Schedule, Repository, App hooks, Retention, Notifications)

**New job wizard** (5 steps, modal overlay style):

1. Source — source type picker (grid of cards: Filesystem, Docker volume, Docker container, Database, Proxmox VM, Proxmox LXC, Windows system, Files)
2. Target — choose repository or create new
3. Schedule — cron builder with presets (hourly, daily, weekly, custom)
4. Hooks — app hook picker if source is database or container (auto-suggested based on source)
5. Review — summary card, [Create job] primary

**Empty (no jobs):** "Create your first backup job" CTA with source-type quick-start grid.

---

### 4.4 Schedules

Calendar-style week view + list view toggle in top right.

**Week view:** 7 columns × 24 rows. Each scheduled run rendered as a coloured block on its start time. Block shows job name + duration estimate. Hover → tooltip with next 3 run times. Click → jump to job detail.

**List view:** grouped by next-run-day: `Today`, `Tomorrow`, `This week`, `Later`. Each entry = job name + cron + next run + estimated duration.

Top bar: date picker (defaults to this week) + timezone display + [View logic] ghost button showing how BackupOS resolved conflicts.

**Empty:** "No active schedules. Jobs without schedules only run on demand." → [View jobs] link.

---

### 4.5 Snapshots

Repository-scoped browser. Repository picker at top.

Layout: left rail (30%) = snapshot list sorted newest-first, right pane (70%) = snapshot contents tree-browser.

**Snapshot list row:**
```
● snapshot-id (short hash, mono)     tags    host    time ago
  1.2 GB    42 files    job:nightly-postgres
```

**Contents browser:** tree view on left, file preview/metadata on right. Path breadcrumb at top. Restore button in top-right activates multi-select mode.

**Filters:** tags, host, job, time range. Appear as chips above the list.

**Actions on snapshot:** Restore · Mount (V2 badge) · Verify · Forget · Tag.

**Empty (no snapshots yet for repo):** "This repository has no snapshots. Run a job targeting it to create one."

---

### 4.6 Agents

Table: `status · name · host · platform · version · last seen · jobs · actions`

- `status` — online (--ok) / offline (--err) / updating (--info)
- `platform` — badge: Linux (x64/ARM64) or Windows (VSS)
- `version` — agent version mono; red if >1 version behind
- `jobs` — count of jobs assigned

**Detail drawer:** host info (OS, kernel, CPU, RAM), assigned jobs list, recent runs executed by this agent, live log tail (if connected), unenroll danger action at bottom.

**Enrol agent flow (modal):**
1. Platform picker — Linux or Windows cards
2. Show install command — `curl ... | bash` (Linux) or `irm ... | iex` (Windows) with pre-filled enrolment token
3. Waiting state with live "waiting for agent..." spinner
4. Success — agent appeared, show host detection summary, [Done]

**Empty:** full-page enrolment CTA with both platform options side-by-side.

---

### 4.7 Repositories

Card grid (not table — more visual for storage).

Each repo card:
```
┌──────────────────────────────────────────────┐
│ [backend-icon]  production-r2         [⋯]    │
│                                              │
│   ████████░░░░  62% of 500 GB quota         │
│                                              │
│   312 snapshots · growing 4.2 GB/wk          │
│   $6.80/mo est · last check 2h ago ●         │
│                                              │
│   [Browse]  [Check]  [Stats]                 │
└──────────────────────────────────────────────┘
```

**Detail page:** stats panel (size, snapshot count, dedup ratio, compression), storage cost breakdown table, recent checks with read-data verification log, backend-comparison recommendation if savings possible.

**Add repository wizard:**
1. Backend picker — grid of cards: Cloudflare R2, Backblaze B2, Wasabi, AWS S3, Hetzner Storage Box, SFTP, Local path. Each card shows per-GB price and gotcha chips (e.g. "90-day min retention" on Wasabi)
2. Credentials form (backend-specific)
3. Repository password (confirm twice, warning card explaining it cannot be recovered)
4. Test connection — live check with status list (auth, read, write, init)
5. Review + create

**Empty:** "No repositories yet. Add one to start running backups." with backend-picker shortcut grid.

---

### 4.8 Monitors (third-party)

Separate from internal BackupOS repos. This is where PBS, Borg, Duplicati get monitored.

Table: `status · name · type · endpoint · last check · last backup · actions`

- `type` — badge: PBS / Borg / Duplicati / Veeam (last two V2, show "V2" badge on stub)
- `last backup` — age of most recent successful backup reported by monitor

**Detail drawer:** monitor config, recent check history chart, raw response from last poll, alert rules scoped to this monitor.

**Add monitor wizard (modal, 3 steps):**
1. Type picker — PBS / Borg / Duplicati (grey out V2)
2. Connection — type-specific form (PBS: URL + token; Borg: SSH command + passphrase)
3. Test + create

**Empty:** "Monitor third-party backup tools alongside your BackupOS jobs." with type cards.

---

### 4.9 Restore specs

Two-pane editor layout. Left = spec list, right = YAML editor + preview.

**Spec list row:** name, step count, last run status, last edited.

**Editor:**
- YAML editor with syntax highlight + schema validation (Monaco with custom schema)
- Live validation errors in gutter + error list below
- Right side preview: "If you run this, these steps will execute:" → numbered list in plain English, each with its `on_failure` behaviour visible
- Top bar: [Validate] · [Dry-run] · [Save] · [Run now] (primary)

**Dry-run result modal:** step-by-step walkthrough showing what would be restored where, what hooks would fire, estimated duration and data size.

**Empty:** split layout — left empty state "No specs yet", right loaded with an example spec (read-only) labelled "Example: restore-postgres.yaml" with [Use as template] button.

---

### 4.10 Restore runs

Table: `status · spec · triggered by · started · duration · actions`

Click row → full-screen drawer with step-by-step progress view:
- Each step is a row with status icon + name + duration + inline log
- Active step auto-expands and shows live output
- Failed step auto-expands with error detail + [Retry step] (if idempotent) and [Abort run] actions
- Footer: [Download full log] · [Open spec]

**Empty:** "No restore runs yet. Runs appear here when you execute a restore spec."

---

### 4.11 Alerts

Two tabs: **Open · All**

**Open tab:** card list (not table — alerts deserve more space per item).

Each alert card:
```
[severity-icon]  backup_failed on nightly-postgres    [Ack]  [Mute]
                 Failed 2/3 recent runs · first seen 4h ago
                 Rule: fail-rate > 50% over 3 runs
```

**All tab:** table with filters (status, severity, rule, time range).

**Rules page (secondary route `/alerts/rules`):** table of alert rules with toggle on/off column, quick-edit drawer.

**New rule wizard (modal):**
1. Rule type — backup_failed / backup_missed / storage_quota / growth_spike / integrity_error / monitor_down
2. Scope — all jobs / specific jobs / specific repos / specific monitors
3. Threshold + window
4. Notifications — email recipients + future (webhook, Slack)

**Empty (open tab):** happy empty state — "All quiet. No open alerts." with a soft green check icon.

---

### 4.12 Audit log

Dense table, designed for scan-reading.

Columns: `timestamp · actor · action · entity · result · ip`

- `timestamp` — mono, absolute time; relative in tooltip
- `action` — verb.object format: `job.create`, `snapshot.forget`, `repo.check`
- `result` — ok / denied / error badge
- Row click → drawer with full JSON event payload

**Filters (left rail):** actor, action type, entity type, result, date range. Persistent URL params for shareable views.

**Export button top-right:** CSV or JSON download of current filter view.

**Empty:** "No audit events match your filters."

---

### 4.13 Settings

Left rail sub-nav inside settings:

```
GENERAL
  • Instance              (name, timezone, branding)
  • Notifications         (SMTP config, default recipients)
  • Security              (session length, 2FA, API tokens)

BACKUP DEFAULTS
  • Retention policy      (default forget policy for new jobs)
  • Schedule windows      (maintenance windows, quiet hours)
  • Cost budgets          (global monthly ceiling, per-repo ceilings)

INTEGRATIONS
  • Infra OS              (connection, shared agent config)
  • Webhooks              (V2 badge)

ACCOUNT
  • Profile               (name, email, password)
  • Billing               (plan, Lemon Squeezy portal link, invoices)
  • Licence               (self-hosted licence key entry)
```

Each sub-page uses standard form patterns. Billing page identical to ProxyOS billing per OS Family build standard.

---

## 5. Modal catalogue

All modals use base modal pattern (§3.6). Specific instances:

| Modal | Width | Notes |
|---|---|---|
| Confirm destructive | 480px | Red accent, requires typed confirmation for repo deletion |
| New job wizard | 720px | 5-step, progress indicator top |
| New repository wizard | 720px | 5-step, progress indicator top |
| Enrol agent | 640px | Code block with copy-to-clipboard, live status footer |
| Add monitor | 640px | 3-step |
| Forget snapshots (bulk) | 520px | Shows count, retention preview |
| Restore spec dry-run | 800px | Scrollable step preview |
| Run detail | 80% viewport | Drawer from right, not modal; log tail |
| Cost recommendation | 560px | "Switch to B2, save $XX/yr" with comparison table |
| Pre-update snapshot (V2) | 560px | Infra OS integration flow |

---

## 6. Empty state catalogue

Every page must have an empty state. Checklist:

| Page | Empty state type | Primary action |
|---|---|---|
| Dashboard | Page empty (first run) | Enrol agent |
| Activity | Page empty | (none — passive) |
| Jobs | Page empty | New job |
| Schedules | Inline ("jobs without schedules") | View jobs |
| Snapshots | Inline | Run a job |
| Agents | Page empty | Enrol agent |
| Repositories | Page empty | Add repository |
| Monitors | Page empty | Add monitor |
| Restore specs | Split (example spec shown) | Use as template |
| Restore runs | Inline | View specs |
| Alerts (open) | Happy empty | (none) |
| Audit log | Filtered empty | Clear filters |
| All filtered views | Filtered empty | Clear filters |

---

## 7. Responsive behaviour

V1 is desktop-first (≥1280px). Breakpoints defined but not polished until V1.1:

- ≥1280px — full shell, all layouts as specified
- 960–1279px — sidebar collapses to 64px icon rail, nav labels hidden; topbar search shrinks to icon
- 640–959px — sidebar becomes slide-over triggered by hamburger in topbar; content reflows to single column
- <640px — not supported in V1, show banner "BackupOS is desktop-optimised. Mobile UI coming in V2."

---

## 8. Iconography

Lucide icons throughout, 16px default in-body, 20px in buttons, 24px in section headers, 32–48px in empty states.

Key icon mappings:

| Concept | Icon |
|---|---|
| Backup / Run | `play` / `play-circle` for active |
| Repository | `database` |
| Snapshot | `camera` |
| Restore | `rotate-ccw` |
| Agent | `server` |
| Monitor (third-party) | `radar` |
| Schedule | `clock` |
| Alert | `triangle-alert` |
| Audit | `file-clock` |
| Proxmox VM/LXC | `box` / `cpu` |
| Docker | `container` |
| Database | `database-zap` for hook-aware |
| Filesystem | `folder-tree` |
| Windows system | `monitor` |
| Cost | `wallet` |
| Integrity check | `shield-check` |

Never mix icon sets. Lucide only.

---

## 9. Motion

- Default transition: `150ms ease-out` on hover, focus, expand
- Modal open: 180ms fade + 8px slide-up
- Drawer: 220ms slide from right
- Toast: 160ms fade + 4px slide-up, auto-dismiss 5s
- Progress bars (backup runs): smooth width interpolation, no step animation
- Live-updating lists (recent runs, logs): new item fades in 200ms, others shift 150ms
- Loading spinners: 1s rotation, `--accent` stroke
- Never animate layout shifts longer than 250ms

---

## 10. Build priorities for Claude Code

Recommended order inside `apps/web`:

1. **Shell** — sidebar + topbar + routing scaffold + theme tokens
2. **Dashboard** — KPI cards + recent runs (wire to mocked tRPC first, then live)
3. **Jobs list + detail + new-job wizard** — the core user flow
4. **Agents + enrolment flow** — can't test jobs without an agent
5. **Repositories + add-repo wizard** — jobs need a target
6. **Snapshots browser** — verification that the pipeline works
7. **Restore specs + runs** — closes the loop
8. **Monitors** — third-party, standalone-ish
9. **Alerts + rules** — built on top of everything above
10. **Settings + billing + audit log** — OS Family standards

Each phase ships its own empty states and modals. Don't skip empties — they're the visible proof of first-run UX.

---

## Appendix A — OS Family shell rules compliance

This spec honours these locked rules:

- ✅ No border-bottom on logo row
- ✅ Active nav = `--accent-dim` fill only, no right-border
- ✅ No border/line above sidebar bottom area
- ✅ Sidebar bottom stack order: icon row → avatar+name → tier·version
- ✅ Icons on own row, not inline right of avatar
- ✅ Topbar left = breadcrumb, no avatar in topbar
- ✅ IBM Plex Mono for technical values, Inter for prose
- ✅ Surface tokens `--bg --bg2 --surf --surf2`
- ✅ Semantic green/amber/red/blue identical across products
- ✅ `--radius` 12px, `--radius-sm` 8px
- ✅ Only `--accent` + logo mark colour differ from sibling products
- ✅ Every product includes billing, user profiles/login, logging (built into Settings + Audit + Activity)
