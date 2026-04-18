# BackupOS UI Design Spec v2

Supersedes v1. Same OS Family shell and tokens — this document **adds** features, improves existing ones, specs the profile/security system, expands the logging story, and delivers the logo assets.

Read v1 first for foundational tokens and shell rules. This doc focuses on what changed and what's new.

---

## Part 1 — New features

### 1.1 Restore verification (scheduled restore tests)

The feature that kills "Schrödinger's backup." V1, not V2.

**The problem:** A backup that never gets restored is worthless. Restic check verifies repo integrity, not that your backup is *usable*.

**The feature:** Scheduled automated restore tests. Pick a job, pick a target (an isolated LXC, a temp directory, a Docker volume on a sandbox host), schedule how often (weekly default), and BackupOS runs an actual restore into the sandbox, runs a user-defined validation hook (e.g. `psql -c "SELECT COUNT(*) FROM users"`), records the result, and tears the sandbox down.

**UI:**
- New page: **Verification** (under `BACKUP` nav group, between Snapshots and Agents)
- Page layout identical to Jobs: list view with status · name · job · target · schedule · last result · next run
- Each test has a detail page showing a chart of pass/fail over time, plus full logs from each run
- Test creation wizard (4 steps): Pick job → Pick sandbox target → Validation hook → Schedule
- Sandbox target types: temp directory on agent, Docker volume on agent, Proxmox VM clone (requires hypervisor driver), SSH target

**Alert rule added:** `verification_failed` — fires on any failed restore test.

**Dashboard addition:** New KPI tile "Verified backups" showing % of jobs with a passing restore test in the last 7 days. Red when under 80%.

---

### 1.2 Disaster Recovery mode

**The problem:** When things go wrong, you're stressed, and a dashboard isn't what you need. You need a runbook.

**The feature:** A dedicated DR Mode view (top-right toggle, keyboard shortcut `⌘⇧D`). Entering DR Mode transforms the UI:
- Everything non-recovery fades to near-invisible
- A guided recovery flow takes over the content area
- Three big cards: "Restore a file", "Restore a database", "Restore a whole host"
- Each flow is a wizard with extra hand-holding, dry-run required before execution, and a "What will this touch?" impact preview

**UI elements:**
- DR Mode toggle in topbar (shield icon, pulses red-dim when any job has failed in last 24h — subtle prompt)
- DR Mode uses a distinct surface tint: `--surf` gets a subtle red-shift to mark context
- Persistent "Exit DR Mode" button top-right when active
- All DR actions are audit-logged with a `dr_mode: true` flag for post-incident review

**Additional:** DR runbook export — any restore spec can be exported as a printable PDF runbook (for the "when Claude is down and production is on fire" scenario). Ironic but useful.

---

### 1.3 Bandwidth and schedule windows

**The problem:** Running a full backup at noon on a metered link kills your household. Running one at 3am on a homelab with a noisy fan wakes you up.

**The feature:** Global and per-job bandwidth throttling + backup windows.

**UI:**
- Settings → Backup defaults → Schedule windows (already in v1) — expanded to include bandwidth profile picker
- New concept: **Bandwidth profiles** (e.g. "Quiet hours: 2 MB/s", "Business hours: 10 MB/s", "Unlimited: off"). User-defined.
- Profiles have time-of-day rules: e.g. 00:00–06:00 "Unlimited", 06:00–09:00 "Quiet hours", 09:00–22:00 "Business hours"
- Job-level override: any job can pick its own profile or "inherit global"
- Live bandwidth graph on dashboard (sparkline, last hour, shows throttling in effect with a subtle line)

---

### 1.4 Pre-flight checks

**The problem:** Backup jobs fail because a path doesn't exist, credentials expired, or the repo is full. You only find out at 3am when the alert fires.

**The feature:** Every job has a "Pre-flight" button that runs all checks without actually backing up:
- Source paths exist and are readable
- Agent is online
- Repo is reachable and has quota
- App hook prerequisites (e.g. `pg_dump` installed, credentials valid)
- Expected backup size vs. repo free space

**UI:**
- [Pre-flight] button in job detail page, next to [Run now]
- Pre-flight runs in a modal with live checklist
- Green ticks, red crosses, amber warnings
- Scheduled jobs can be configured to run pre-flight 15min before their scheduled time — if any check fails, fires a `preflight_failed` alert so you can fix before the backup window

**Settings:** `Automatically run pre-flight checks 15 minutes before scheduled runs` toggle (default on).

---

### 1.5 Snapshot tagging, pinning, and retention holds

**The problem:** Restic forget policies are blunt. You want to keep "the snapshot from right before the big migration" forever without writing a custom retention rule.

**The feature:** Three levels of snapshot protection:
- **Tags** — arbitrary labels for organisation (e.g. `pre-upgrade`, `monthly-archive`, `compliance`)
- **Pin** — a single toggle that means "never forget this snapshot regardless of policy"
- **Retention hold** — pin with an expiry date (e.g. "hold until 2027-01-01 for audit")

**UI additions to Snapshots page:**
- Snapshot row actions include Tag · Pin · Hold (new)
- Pinned snapshots show a pin icon; held snapshots show a lock icon with expiry tooltip
- Filter dropdown adds "Only pinned", "Only held", "Has tag"
- Bulk select: tag, pin, hold multiple snapshots at once

**Retention policy editor update:** The forget policy preview now shows "X snapshots protected by pins, Y by holds" so users understand what's excluded.

---

### 1.6 Growth forecasting (cost analytics v2)

**The problem:** "Is my backup cost going to double next year?"

**The feature:** Project storage growth and cost forward based on observed growth rate.

**UI:**
- Repositories detail page gets a new "Forecast" card showing line chart with two series:
  - Actual storage used (last 90 days)
  - Forecast (next 12 months) with confidence band
- Cost forecast below: "Estimated cost in 12 months: $14.20/mo" (vs current $6.80)
- Forecast accounts for retention policy: "With current forget policy, storage plateaus at ~340 GB around month 7"
- If forecast exceeds user's cost budget, banner appears: "Projected cost will exceed your $10/mo budget in 5 months. View suggestions →"

**Suggestions engine:**
- "Tighten retention policy" — preview impact
- "Switch backend" — cost comparison against all supported backends
- "Enable compression" — if not already on
- "Exclude large files" — top 10 contributors to growth with option to add exclusion patterns

---

### 1.7 Global search (⌘K)

The topbar already has a search bar. Spec what it actually does:

**The feature:** Fuzzy global search across: jobs, snapshots, repositories, agents, restore specs, alerts, audit events, and settings.

**UI:**
- ⌘K opens full-screen overlay (not sidebar drawer — full search is the focus)
- Input field at top, 48px tall, `--text-lg`
- Results grouped by type under section headers
- Each result shows icon · primary label · secondary metadata · action hint
- Keyboard navigation: ↑↓ to move, ↵ to activate, ⌘K or Esc to dismiss
- Recent searches saved locally, shown when input is empty
- Command actions also searchable: "Enrol agent", "Create job", "Run pre-flight on [job]", etc. These appear in a "Commands" section

---

### 1.8 Live run streaming + session replay

**The problem:** You want to watch a backup happen. Or later, review exactly what happened.

**The feature:** Every run page shows a live log stream with timestamps. Completed runs preserve the full session (stored compressed) so you can scrub through it later.

**UI:**
- Run detail view (already specced in v1) gains a **timeline scrubber** at bottom for completed runs
- Scrubber shows phases: pre-hook → backup → post-hook → verification, with timing bars
- Drag scrubber → log view jumps to that moment
- "Jump to error" button if run failed, takes you to the failure point
- "Copy as command" button — for the restic invocation, useful for debugging

---

### 1.9 Encryption key escrow

**The problem:** Repository passwords can't be recovered. Users lose them. BackupOS should protect users from themselves.

**The feature:** Optional encrypted escrow of repo passwords, guarded by the user's TOTP.

**UI:**
- Add repository wizard gets a new step: "Key escrow (optional)"
- Explains: "BackupOS can store an encrypted copy of this password. Decrypting it requires your TOTP code. If you lose your password, you can recover it using your TOTP. If you lose both, the backup is unrecoverable."
- Toggle. If on, password is encrypted with a key derived from user account + current TOTP secret
- Repository detail page shows "Password in escrow ✓" or "No escrow — password loss will destroy this backup ⚠"
- Recovery flow at Settings → Security → Recover repository password

This is a meaningful differentiator vs. raw Restic. Many users opt out of encryption *because* they're scared of losing the password.

---

### 1.10 Infra OS service-aware backups (V1, previously V3)

Originally deferred to V3 but worth pulling forward for the killer workflow. Light version only:

**The feature:** When Infra OS is connected, BackupOS can auto-suggest backup jobs based on detected services.

**UI:**
- Dashboard adds a card "Services without backups" — lists Infra OS-detected services that have no backup job targeting them
- Each entry has a one-click "Create recommended job" action that opens the new-job wizard pre-filled

Full auto-provisioning (policies, rules) stays in V2. This is just the suggestion engine.

---

### 1.11 Health score

**The problem:** "Is my backup setup actually good?" is a question that requires clicking through six pages.

**The feature:** A single health score (0–100) for the whole BackupOS instance, prominently displayed on the dashboard.

**Score factors:**
- % of jobs with a successful run in last 24h × weight
- % of repos with a recent integrity check × weight
- % of jobs with a passing restore verification × weight
- % of critical services (from Infra OS) with a backup job × weight
- Number of open alerts (negative)
- Agent online % × weight

**UI:**
- Dashboard hero: big score with letter grade (A+, A, B, C, D, F)
- Click to open a breakdown modal showing each factor's contribution and what to fix to improve
- Historical sparkline below score (last 30 days)
- Grade turns red if drops below C

---

## Part 2 — Improvements to existing features

### 2.1 Jobs — improvements

- **Job dependencies:** Job A runs → Job B runs after A succeeds. Useful for multi-tier backups (DB dump first, then filesystem of DB host). New field in Schedule step: "Run after: [picker]"
- **Job templates:** Save a job config as a template. When adding a new job, offer "Start from template" alongside "Blank"
- **Job health badges at row level:** status column shows not just last-run status but a 7-day strip (7 little dots, green/red/missed) for pattern recognition
- **Bulk operations:** select multiple jobs → pause, resume, run, delete

### 2.2 Repositories — improvements

- **Repository groups:** Tag repos with environments (prod, home, lab) and filter dashboard by group
- **Multi-backend replication view:** Restic doesn't support native mirroring but BackupOS can show "this repo is copied to R2 and to a local NAS via rclone" as a read-only fact
- **Dedup ratio visualisation:** Each repo card shows a small bar: [compressed] [deduped] [overhead] as a stacked segment

### 2.3 Snapshots — improvements

- **Diff view:** Select two snapshots of the same job → see what files changed, were added, or deleted. Tree view with +/- indicators
- **Size by path:** For any snapshot, show a treemap visualisation of what's taking space. Helps identify "oh, this log directory is eating my backup"
- **Restore preview:** Before restoring, show "This will write N files totalling X GB to target"

### 2.4 Agents — improvements

- **Agent auto-update channel picker:** Stable / Beta / Pinned. Per-agent or global default
- **Agent capabilities badges:** VSS, hypervisor driver, app hooks available, etc. visible at a glance
- **Agent resource usage:** CPU/RAM/disk I/O of the agent process itself, last 24h sparkline on detail drawer. Important because backups shouldn't kill the host
- **Agent logs** — separate from run logs. The agent's own operational log, streamed live

### 2.5 Monitors — improvements

- **Unified timeline:** Rather than separate detail pages, a unified "all backup activity" timeline view that interleaves BackupOS runs + PBS + Borg results chronologically
- **Monitor groups:** Same grouping concept as repos
- **"Promote to managed"** — For PBS, a button that offers to migrate the backup target into BackupOS-managed (preserving history where possible). Deferred to V2 execution, UI stub in V1

### 2.6 Restore specs — improvements

- **Spec library:** Pre-made example specs for common scenarios (Postgres DR, Docker stack DR, full-host DR) — fork-to-customise pattern
- **Spec variables:** `${SNAPSHOT_ID}`, `${DATE}`, `${HOST}` — resolved at run time
- **Step marketplace (V2 stub):** Share specs with community. UI stub only for V1.

### 2.7 Alerts — improvements

- **Alert grouping:** If 10 jobs all fail because the repo is unreachable, group into one parent alert with 10 children. Dashboard shows parent only
- **Alert snoozing:** Snooze for 1h / 4h / 24h / until date. Better than raw mute
- **Webhook channels alongside email:** Discord, Slack, generic webhook (V1 — upgraded from V2)
- **Alert routing rules:** Different rules → different channels. e.g. verification failures → Discord, everything else → email

---

## Part 3 — Profile, avatar, phone, TOTP

### 3.1 Profile menu

**Trigger:** Avatar button in the **sidebar bottom stack** (not topbar — that's an OS Family rule). Clicking opens a popover, not a dropdown, with richer layout.

**Popover content** (280px wide, anchored to the avatar):

```
┌────────────────────────────────────────┐
│  [avatar 48px]  Darius Vorster          │
│                 darius@homelabza.com    │
│                 Solo · v0.4.0           │
├────────────────────────────────────────┤
│  👤  Profile                     →     │
│  🔐  Security                    →     │
│  💳  Billing                     →     │
│  🔑  API tokens                  →     │
├────────────────────────────────────────┤
│  🌓  Theme                       auto ▾│
│  ⚙️   Settings                    →     │
├────────────────────────────────────────┤
│  ↩️   Sign out                          │
└────────────────────────────────────────┘
```

- Avatar row: 48px avatar, name `--text-md`, email `--text-xs --fg-mute`, tier subline `--text-xs --fg-dim`
- Menu items: 36px rows, icon + label + chevron, hover `--surf2`
- Theme toggle: inline cycle (auto / light / dark) without navigation
- Sign out in danger-dim hover state (`--err-dim` on hover, `--err` text)

### 3.2 Avatar

**Avatar component spec:**

- Shape: circle, sizes 24 / 32 / 48 / 80
- Sources in priority order:
  1. Uploaded image (stored in `/data/avatars/{userId}.webp` self-hosted; S3 in Cloud tier)
  2. Gravatar (by email hash) — **opt-in only**, privacy-preserving default
  3. Generated initial avatar — background colour derived from name hash using a fixed palette of 8 colours, white initials, 500 weight
- Upload flow: drag-and-drop or click to upload, client-side crop to square, resize to 256×256 WebP, max 1 MB accepted
- No border/ring on avatar anywhere (OS Family rule)

### 3.3 Profile page (`/settings/profile`)

Layout: single column, max width 640px, sections separated by `--space-8`.

**Section: Avatar**
- Current avatar 80px on left
- Three actions stacked: [Upload image] · [Use Gravatar] · [Remove]
- Helper text: "Self-hosted: stored locally. Cloud: stored in your account."

**Section: Personal information**
- Full name (required, `--text-base` input)
- Display name (optional, shown in UI if set, else full name)
- Email (locked, "Change email" link opens modal requiring current password + verification)
- Phone number (new — see §3.4)
- Timezone (dropdown, defaults to browser)
- Language (dropdown, V1 = English only, future-ready field)

**Section: Contact preferences**
- Email notifications (master toggle)
- SMS notifications (toggle, requires verified phone)
- Per-category toggles: Alerts, Weekly summary, Product updates

Save button is sticky at the bottom of the form area when unsaved changes exist.

### 3.4 Phone number system

**Why it matters:**
- SMS 2FA fallback (TOTP primary, SMS backup)
- SMS alert channel (opt-in, critical alerts only)
- Account recovery

**Phone verification flow:**
1. User enters phone in profile → [Send code]
2. Modal: 6-digit code input, resend timer (60s cooldown)
3. Enter code → phone marked verified with green tick in profile
4. Unverified phone never receives SMS — shown with amber warning in profile

**Phone display format:** International E.164 in storage, localised display (e.g. +27 82 123 4567 in ZA format, +1 (305) 555-0100 in US format).

**UI components:**
- Phone input: country code dropdown + number field, inline verified/unverified badge
- Verification code input: 6 separate boxes, auto-advance on keypress, paste handling

**Settings control:** User can delete their phone at any time. Removing a verified phone with SMS 2FA enabled triggers a warning: "Removing this phone will disable SMS as a 2FA method. You'll still have TOTP enabled."

### 3.5 TOTP (security page)

**Page:** `/settings/security` — this replaces the flat "Security" section from v1 with a dedicated page.

**Layout sections (top to bottom):**

#### §1 Password
- Change password (current + new + confirm)
- Last changed: relative time
- Strength meter on new password input

#### §2 Two-factor authentication
Empty state:
```
┌─────────────────────────────────────────────┐
│  Two-factor authentication is off.          │
│  Add a second factor to protect your        │
│  account even if your password is leaked.   │
│                                             │
│  [Enable TOTP]                              │
└─────────────────────────────────────────────┘
```

After TOTP enabled:
```
┌─────────────────────────────────────────────┐
│  ✓ TOTP                            [Remove] │
│    Added Apr 16, 2026                       │
│    Backup codes: 8 remaining                │
│                                             │
│  ✓ SMS backup                      [Remove] │
│    +27 82 ••• 4567 (verified)               │
│                                             │
│  [+ Add another method]                     │
└─────────────────────────────────────────────┘
```

**TOTP enrolment flow (modal, 3 steps):**

*Step 1 — Verify identity*
- "Enter your password to continue" — password re-entry guard
- Prevents someone sitting at an unlocked session from enabling 2FA under your account

*Step 2 — Scan QR*
- Large QR code (256×256) on left
- Secret (manual entry) on right, IBM Plex Mono, monospaced, copy button
- Issuer: "BackupOS ({{instance name}})"
- Account label: email
- Instructions: "Scan with 1Password, Authy, Google Authenticator, or any TOTP app"
- [Continue] button

*Step 3 — Verify and save backup codes*
- 6-digit code input → on valid code, reveal 10 backup codes (IBM Plex Mono grid, 2 cols × 5 rows)
- Each code is single-use, 8 chars: `XXXX-XXXX`
- Three actions: [Copy all] · [Download .txt] · [Print]
- Required checkbox: "I've saved these codes somewhere safe"
- [Finish] button enabled only after checkbox

**Backup codes page:**
- Lists remaining codes (one-way — regenerating invalidates previous batch)
- "Regenerate" button with confirmation modal
- Shows last-used code timestamp

**Trusted devices (V1.1):**
- "Remember this device for 30 days" checkbox on TOTP prompt at login
- List of trusted devices with last-seen IP + user agent
- Revoke per-device

#### §3 Active sessions
Table: device · location (IP → city via GeoIP) · last active · actions
- Current session marked
- Revoke individual sessions
- "Sign out all other sessions" danger button

#### §4 API tokens
- List of personal API tokens with scope badges + last used
- Create token modal: name, scopes (checkbox list), expiry (30d / 90d / 1y / never)
- Token shown once on creation with warning "You will not see this again"

#### §5 Audit scope
- Link to Audit log pre-filtered to "my actions only"
- Exportable

---

## Part 4 — Logging feature (expanded)

BackupOS v1 had `Activity` (user-facing) and `Audit log` (security). v2 adds a proper observability layer.

### 4.1 Three tiers of logging

| Tier | Audience | Content | Retention default | Location |
|---|---|---|---|---|
| **Activity feed** | Users | High-level events: "Darius ran job nightly-postgres" | 90 days | DB table `activity` |
| **Audit log** | Admins / compliance | Security events: logins, permission changes, destructive actions | 1 year (configurable up to forever) | DB table `audit` |
| **Operational logs** | Operators / debuggers | Structured logs from backup engine, agents, web app | 14 days default, configurable | DB table `logs` with JSONL export |

### 4.2 Operational logs — new page

**Route:** `/logs`

**Nav placement:** Under `OVERVIEW` group, between Activity and the start of BACKUP group. Icon: `file-terminal`.

**Layout:**
- Left filter rail (240px): component picker (web, agent-{host}, engine, hypervisor, hook, monitor), level picker (debug/info/warn/error/fatal), time range, free-text search
- Main area: log stream, newest at top by default, scrollable
- Each log entry:
  ```
  timestamp  level-badge  component  message                                [⋯]
  Plex Mono  [INFO]       web        Job nightly-postgres scheduled to run...
  ```
- Click entry → expands to show full structured JSON payload inline, syntax-highlighted
- Top bar: [Live tail] toggle (websocket stream) · [Pause] · [Download] · [Copy filter URL]

### 4.3 Per-entity log views

Every job, agent, repo, monitor, and restore run has a "Logs" tab/section that opens Operational logs pre-filtered to that entity. No navigation required.

### 4.4 Log retention settings

Settings → General → Logging:
- Activity retention: 30d / 90d / 180d / 365d / forever
- Audit retention: 90d / 365d / 3y / 7y / forever
- Operational retention: 7d / 14d / 30d / 90d
- Daily rotation + optional compression (gzip) for operational logs at rest

### 4.5 Log export

- Manual export: any filtered view → [Export] → CSV or JSONL
- Scheduled export: Settings → Logging → "Nightly export to S3" (V2)
- Live streaming: WebSocket endpoint `/api/logs/stream` for piping to Loki/Elasticsearch (V1, documented)

### 4.6 Audit log improvements (over v1)

- **Verb.object ontology expanded** — new event types for 2FA, sessions, API tokens, escrow access
- **Forensic mode** — enter an actor's name, get a full timeline of their actions with inline diffs for config changes
- **Tamper-evidence** — each audit entry is hash-chained to the previous (`prev_hash`, `hash`). Tampering with a row breaks the chain. A `/settings/security` widget shows "Audit chain integrity: ✓ verified 2m ago"
- **Digital signing (V2):** sign each entry with instance private key for external verification

---

## Part 5 — Logo and branding

### 5.1 Logo concept: **Grid Shield**

A 4-quadrant grid meeting at a bright central square, same construction family as ProxyOS Grid Pivot but in amber. The visual metaphor: four "backups" converging to a single point of truth. The bright centre reads as a restore point, a snapshot, a safe harbour.

### 5.2 SVG assets

All logos use a 48×48 viewBox for consistency across the OS Family. Rounded outer radius `rx=16`.

#### Primary mark (48×48)

```svg
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="16" fill="#1A1206"/>
  <rect x="6"  y="6"  width="16" height="16" rx="2" fill="#F5A623"/>
  <rect x="26" y="6"  width="16" height="16" rx="2" fill="#854F0B"/>
  <rect x="6"  y="26" width="16" height="16" rx="2" fill="#854F0B"/>
  <rect x="26" y="26" width="16" height="16" rx="2" fill="#C77A14"/>
  <rect x="18" y="18" width="12" height="12" rx="2" fill="#FEF5E0"/>
</svg>
```

- Outer rounded square: `#1A1206` (deep amber-black — 4% more saturated than pure black for warmth)
- Top-left quadrant: bright `#F5A623` (primary accent)
- Top-right: `#854F0B` (dark accent)
- Bottom-left: `#854F0B`
- Bottom-right: `#C77A14` (mid amber — new, bridges light and dark)
- Centre square: `#FEF5E0` (soft cream, same white-point as ProxyOS for cross-family consistency)

The asymmetric placement of the bright quadrant (top-left) gives the mark directionality and visual interest — it's not a mandala, it reads.

#### Wordmark (horizontal)

For use in sidebar, topbar, footer:

```
[Grid Shield 24×24]  BackupOS
```

- Mark: 24×24, `--space-3` (12px) gap
- Wordmark: "BackupOS" in **Inter** 500 weight, 16px, letter-spacing `-0.01em`
- "Backup" in `--fg`, "OS" in `--accent`
- Baseline-aligned with mark centre

For OS Family hub consistency, use the same construction: `[mark] [Product][OS in accent]`.

#### Monochrome variant

For print, embossing, single-colour contexts:

```svg
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="16" fill="currentColor"/>
  <rect x="6"  y="6"  width="16" height="16" rx="2" fill="white" fill-opacity="0.95"/>
  <rect x="26" y="6"  width="16" height="16" rx="2" fill="white" fill-opacity="0.30"/>
  <rect x="6"  y="26" width="16" height="16" rx="2" fill="white" fill-opacity="0.30"/>
  <rect x="26" y="26" width="16" height="16" rx="2" fill="white" fill-opacity="0.55"/>
  <rect x="18" y="18" width="12" height="12" rx="2" fill="white"/>
</svg>
```

Uses `currentColor` so it inherits from parent — useful in dark/light contexts.

### 5.3 Favicon

Browser tab icon. Different requirements than the main mark: must be legible at 16×16.

**Strategy:** A simplified version of the Grid Shield that preserves the four-square-plus-centre identity but with thicker strokes and no rounded inner squares.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="6" fill="#1A1206"/>
  <rect x="4"  y="4"  width="10" height="10" fill="#F5A623"/>
  <rect x="18" y="4"  width="10" height="10" fill="#854F0B"/>
  <rect x="4"  y="18" width="10" height="10" fill="#854F0B"/>
  <rect x="18" y="18" width="10" height="10" fill="#C77A14"/>
  <rect x="12" y="12" width="8"  height="8"  fill="#FEF5E0"/>
</svg>
```

Changes from primary:
- Outer `rx=6` instead of 16 (favicons at 16×16 lose the round shape entirely with rx=16; 6 keeps it visible)
- Inner quadrants: no inner radius (sharper at tiny sizes)
- Centre: 8×8 instead of 12×12 proportionally, reads clearly even at 16×16

### 5.4 Favicon delivery bundle

Ship all of these from `/public/` so the browser picks the right one:

```
/public/favicon.ico              ← 16×16 + 32×32 multi-resolution ICO
/public/favicon.svg              ← SVG variant (modern browsers)
/public/icon-192.png             ← Android Chrome
/public/icon-512.png             ← PWA install
/public/apple-touch-icon.png     ← 180×180 for iOS
/public/manifest.webmanifest     ← PWA manifest
```

`manifest.webmanifest`:
```json
{
  "name": "BackupOS",
  "short_name": "BackupOS",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#F5A623",
  "background_color": "#0A0A0A",
  "display": "standalone",
  "start_url": "/"
}
```

`<head>` tags in Next.js `app/layout.tsx`:
```tsx
export const metadata = {
  title: 'BackupOS',
  description: 'Unified homelab backup management',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' }
    ],
    apple: '/apple-touch-icon.png'
  },
  manifest: '/manifest.webmanifest',
  themeColor: '#F5A623'
}
```

### 5.5 Loading states in tab

Unread-count and processing states in the browser tab favicon:

- Idle: standard favicon
- Running (active backups): animated — centre square pulses opacity 0.6 → 1 → 0.6 every 1.5s (use a canvas-generated dynamic favicon, or swap between two static SVGs)
- Alert (open critical alert): a small red `●` overlaid at top-right of the favicon
- Title prefix: `(2) BackupOS` if 2 critical alerts open, `● BackupOS` if a backup is actively running

Favicon swapping is done from the web app using a `faviconState` store that updates `<link rel="icon">` href.

### 5.6 OG image and social cards

For backupos.app landing page and shared links:

- 1200×630 OG image
- Dark background (`#0A0A0A`) with subtle amber gradient top-left
- Grid Shield mark at 120×120, top-left, `--space-10` padding
- Product tagline large: "Backups that don't lie to you." (48px Inter 500)
- Sub-tagline: "Unified homelab backup management." (20px Inter 400 `--fg-mute`)
- Bottom-right: "backupos.app" in IBM Plex Mono 14px `--fg-dim`
- Optional: faint grid texture overlay at 3% opacity for visual interest

Ship as `/public/og.png`, referenced in metadata.

---

## Part 6 — Updated build priorities

Revised 12-phase order (was 10 in v1):

1. **Shell** — sidebar + topbar + theme tokens + favicon + profile popover shell
2. **Auth + profile + security** — login, password, avatar upload, phone verification, TOTP enrolment, sessions, API tokens. *Before Dashboard* because everything else needs a logged-in user and proper session handling
3. **Dashboard** — KPI cards + health score + recent runs
4. **Agents + enrolment flow**
5. **Repositories + add-repo wizard + key escrow**
6. **Jobs list + detail + new-job wizard + dependencies + templates**
7. **Schedules + bandwidth profiles + pre-flight**
8. **Snapshots browser + tags/pins/holds + diff view**
9. **Restore specs + runs + DR Mode**
10. **Verification (scheduled restore tests)**
11. **Monitors + unified timeline**
12. **Alerts + rules + webhook channels** and **Logging (Activity + Audit + Operational)** in parallel
13. **Settings final pass** — retention, cost budgets, forecasting, Infra OS link

Billing is embedded into Settings → Account (per OS Family standard) and built alongside phase 2.

---

## Part 7 — OS Family compliance checklist (updated)

From v1 plus new rules introduced by v2:

- ✅ All v1 rules still apply
- ✅ Avatar in **sidebar bottom stack**, not topbar
- ✅ Profile popover (not dropdown), anchored to avatar
- ✅ Theme toggle inline in profile popover (auto/light/dark)
- ✅ 2FA enrolment requires password re-entry guard
- ✅ Backup codes forced-save checkbox before completion
- ✅ Favicon has alert/running state variants
- ✅ OG image follows hub visual language
- ✅ Logo mark uses OS Family centre-square convention (same white-point as ProxyOS)
- ✅ Operational logs page uses standard list + filter rail pattern
- ✅ Tamper-evident audit log (hash chain)
- ✅ Structured JSON payload expand pattern on log entries

---

## Part 8 — Documentation

### 8.1 Strategy

Docs are written **once**, rendered **twice**:

1. **External site** — `docs.backupos.app`, Next.js static export from `apps/docs`, public, indexed by search engines, versioned by release tag
2. **In-app** — `/docs` route inside the BackupOS web app, same MDX content rendered inside the shell with sidebar intact, deep links from feature pages

**Single source of truth:** `packages/docs-content/` — flat `.mdx` files plus a `nav.json`. Both sites read from this package. No content drift, no copy-paste.

**Why both:**
- External drives discovery, SEO, evaluation before install
- In-app gives just-in-time help where users already are (?, help buttons on every wizard)
- Deep linking from the app into docs means "Learn more" buttons actually teach rather than dump users on a homepage

### 8.2 Top-level structure

Nine top-level sections in this order:

```
1. Introduction          — what BackupOS is, why use it
2. Getting started       — install, first backup, first restore (happy path)
3. Concepts              — the mental model (jobs, repos, snapshots, agents, specs)
4. How-to guides         — task-focused recipes ("How do I back up a Proxmox VM?")
5. Reference             — exhaustive config options, YAML schemas, CLI
6. Operations            — admin/ops: deploy, upgrade, monitor, troubleshoot
7. Integrations          — Infra OS, ProxyOS, third-party tools
8. Security              — encryption, TOTP, escrow, compliance
9. Release notes         — versioned changelog
```

A **Search** box is always visible at the top (in-app: ⌘K opens global search with docs indexed alongside entities; external: Algolia DocSearch or built-in MiniSearch).

### 8.3 Full page tree with outlines

#### 1. Introduction

**1.1 What is BackupOS**
- Purpose: unified backup management for homelab + SMB
- What it replaces: PBS alone, manual Restic scripts, paid SaaS backup tools
- What it adds: verification, forecasting, DR mode, cross-platform agents
- Architecture diagram: web + agents + repos + hypervisors + monitors

**1.2 Why BackupOS**
- The three problems it solves: trust ("does my backup work?"), cost ("what does this cost me?"), recovery ("how do I actually restore?")
- Comparison table: BackupOS vs PBS vs raw Restic vs Veeam vs Borg
- When to use it, when not to

**1.3 Architecture overview**
- Diagram: web app → agents (Linux/Windows) → sources → Restic repos (R2/B2/local)
- Component responsibilities in prose
- Data flow for a typical backup run (step-by-step with diagram)

**1.4 Terminology cheatsheet**
- Quick glossary: agent, repository, job, run, snapshot, spec, monitor, hook, verification

---

#### 2. Getting started

**2.1 Install BackupOS (self-hosted)**
- Prerequisites: Docker 24+, 2GB RAM, 10GB disk
- `docker-compose.yml` snippet
- First-boot setup wizard walkthrough
- Hitting the UI, creating the admin account
- Enabling TOTP (strongly recommended at setup)

**2.2 Install BackupOS (cloud)**
- Sign up at backupos.app
- Plan differences: Solo vs Teams
- Connecting your first agent over the internet

**2.3 Enrol your first agent**
- Pick a platform (Linux or Windows)
- Run the one-line installer
- Watch agent appear in UI
- Verify capabilities

**2.4 Connect your first repository**
- Pick a backend (recommendation: Cloudflare R2 for starters — cheapest with zero egress)
- Create R2 bucket + API token (screenshots)
- Add repo in BackupOS
- Understand the encryption password (and why you should enable escrow)

**2.5 Run your first backup**
- New job wizard walkthrough
- Pick filesystem source (`/home` is a safe first target)
- Inherit default schedule (nightly)
- Run it manually once
- See snapshot appear

**2.6 Run your first restore**
- Pick the snapshot you just made
- Restore a single file to a test directory
- Verify contents
- Why you should do this every time you onboard a new source

**2.7 What next**
- Links to: Set up verification, Add more sources, Configure alerts, Understand costs

---

#### 3. Concepts

**3.1 Jobs**
- Definition: a source + a target + a schedule + optional hooks
- Lifecycle: idle → queued → running → (success | failed | missed)
- Job dependencies (how chaining works)
- Templates

**3.2 Runs**
- A single execution of a job
- Phases: pre-flight → pre-hook → backup → post-hook → verification
- Session replay and timeline scrubber
- Retry behaviour

**3.3 Sources**
- Full list of source types with when to use each
- Filesystem vs Docker volume vs Docker container — the differences
- Hypervisor sources (Proxmox VM/LXC) vs in-guest agent sources — tradeoffs
- Windows system backups with VSS

**3.4 Repositories**
- What a Restic repo is (briefly, linking to Restic docs)
- Supported backends
- Encryption model
- Key escrow (feature overview, link to Security → Key escrow)

**3.5 Snapshots**
- How they work (content-addressed, deduped)
- Tags vs pins vs holds — when to use which
- Diff view
- Forget policy and retention

**3.6 Agents**
- Linux agent capabilities
- Windows agent + VSS
- Shared `ios-agent v2` (single binary for Infra OS + BackupOS)
- Update channels

**3.7 Restore specs**
- Declarative recovery procedures (YAML)
- Step types
- Failure modes (abort / continue / notify_only)
- Variables and templating

**3.8 Monitors**
- What third-party monitoring means (read-only observation of PBS, Borg, etc.)
- How monitors differ from managed repos
- When to use monitors vs migrating

**3.9 Verification**
- Why scheduled restore tests matter
- Sandbox target types
- Validation hooks
- Reading verification history

**3.10 Health score**
- Factors and weights
- How to improve each factor
- Letter grade thresholds

---

#### 4. How-to guides

Task-focused, copy-paste-friendly. Each page is short: problem → steps → verify.

**4.1 Back up a Proxmox VM**
**4.2 Back up a Proxmox LXC**
**4.3 Back up a PostgreSQL database**
**4.4 Back up a MySQL / MariaDB database**
**4.5 Back up a Redis instance**
**4.6 Back up a SQLite database (safely)**
**4.7 Back up a Docker container with an app hook**
**4.8 Back up a Docker named volume**
**4.9 Back up a Windows system with VSS**
**4.10 Back up a NAS share**
**4.11 Back up specific files only (not whole directories)**
**4.12 Back up multiple hosts on one schedule**
**4.13 Chain jobs (run B after A succeeds)**
**4.14 Restore a single file from a snapshot**
**4.15 Restore a database from a snapshot**
**4.16 Restore a Proxmox VM from a snapshot**
**4.17 Restore an entire host using a spec**
**4.18 Use DR Mode during an incident**
**4.19 Set up scheduled restore verification**
**4.20 Tighten retention to save storage costs**
**4.21 Switch repository backends (e.g. R2 → B2)**
**4.22 Migrate from PBS to BackupOS**
**4.23 Migrate from raw Restic scripts to BackupOS**
**4.24 Set bandwidth limits during business hours**
**4.25 Configure alerts (email, Discord, Slack, webhook)**
**4.26 Pin snapshots before a risky migration**
**4.27 Set up multi-backend replication (R2 + local NAS)**
**4.28 Export audit logs for compliance**
**4.29 Rotate API tokens**
**4.30 Recover a lost repository password (using escrow)**

---

#### 5. Reference

Exhaustive, look-up-oriented. Users arrive here from search.

**5.1 Job configuration reference**
- Every field in the job editor, every valid value, every default

**5.2 Retention policy reference**
- Grammar of forget policies
- Interaction with pins and holds
- Examples: "keep 7 daily, 4 weekly, 12 monthly"

**5.3 Cron expression reference**
- Syntax, with BackupOS-specific extensions (e.g. `@random-within-hour`)
- Timezone handling

**5.4 YAML restore spec reference**
- Full schema
- All step types with parameters
- Variable substitution rules
- Error handling matrix

**5.5 App hook reference**
- Postgres: all options
- MySQL: all options
- Redis, SQLite, MongoDB (V2)
- Custom hook: shell script contract, env vars provided

**5.6 Source type reference**
- Every source type with required/optional fields

**5.7 Alert rule reference**
- Rule types
- Condition grammar
- Channel routing rules

**5.8 CLI reference**
- `backupos` CLI (admin tool for self-hosted)
- `ios backup` commands (shared agent CLI, V2)

**5.9 API reference**
- tRPC endpoints (auto-generated from schema)
- REST wrappers (V2)
- Webhook payload shapes

**5.10 Agent protocol reference**
- WebSocket message types
- Heartbeat and enrolment handshake
- Versioning and compatibility

**5.11 Environment variables reference**
- Every env var BackupOS reads
- Config file equivalents

**5.12 Port and firewall reference**
- What ports BackupOS uses
- Agent outbound requirements
- Reverse proxy setup

---

#### 6. Operations

Admin / ops focused. This is the section your IT Manager persona needs.

**6.1 Deployment patterns**
- Single-host Docker (smallest)
- Multi-host with remote agents
- High-availability (V2 — documented but not recommended for V1)
- Cloud-hosted vs self-hosted decision matrix

**6.2 Initial deployment checklist**
- Hardware sizing
- Network prep (DNS, reverse proxy, cert)
- Storage planning (local cache + remote repo)
- Admin account + TOTP setup
- First-hour verification

**6.3 Upgrading BackupOS**
- Semver policy
- Pre-upgrade checklist (backup of the BackupOS database itself!)
- Docker image pull + recreate
- Database migrations (automatic on startup)
- Agent compatibility matrix (which agent versions work with which server versions)
- Rollback procedure
- Breaking-change notes per release

**6.4 Upgrading agents**
- Update channels (stable / beta / pinned)
- Manual upgrade command
- Bulk upgrade
- Version-skew handling

**6.5 Database maintenance**
- Where BackupOS stores its state (SQLite path, Postgres connection)
- Backing up the BackupOS DB itself (meta!)
- Vacuuming and optimisation
- Migrating SQLite → Postgres (V2)

**6.6 Storage maintenance**
- When to run `restic check`
- When to run `restic prune`
- Scheduling maintenance windows
- Orphan data cleanup

**6.7 Monitoring BackupOS itself**
- Health endpoint: `/healthz`
- Metrics endpoint: `/metrics` (Prometheus, V2)
- What to alert on externally
- Integrating with Uptime Kuma

**6.8 Logs and debugging**
- Log tiers (Activity, Audit, Operational)
- Where logs live, retention
- Exporting for external tooling (Loki, Elasticsearch)
- Common error patterns and what they mean

**6.9 Performance tuning**
- Concurrent job limits
- Bandwidth throttling
- Compression vs speed tradeoffs
- Agent resource limits
- Restic cache sizing

**6.10 Backup strategy (opinionated)**
- 3-2-1 rule applied to homelab
- How to structure your jobs (per-host vs per-service)
- Retention policy recommendations by data type
- Cost-optimal backend pairings

**6.11 Disaster recovery planning**
- DR runbooks (using restore specs)
- RTO/RPO planning
- Offsite backup strategy
- Testing your DR plan (quarterly restore drill)
- What to do when BackupOS itself is down

**6.12 Troubleshooting**
- Job stuck in "running" — what to do
- Agent won't connect — diagnosis flowchart
- Repository integrity errors
- Storage quota exceeded
- Verification failing but backup succeeding
- "My backups are slow" diagnosis tree

**6.13 Capacity planning**
- Estimating storage growth
- Using the forecast view
- When to add more repos / switch backends
- Cost budgeting

**6.14 User and team management (Teams tier)**
- Inviting users
- Roles and permissions
- SSO integration (Authentik, Authelia)
- Offboarding users

---

#### 7. Integrations

**7.1 Infra OS integration**
- What the Layer 1 API provides
- Shared agent setup
- Service-aware backup suggestions
- Pre-update snapshot workflow (V2)
- Reading backup status in Infra OS topology

**7.2 ProxyOS integration**
- Exposing BackupOS through ProxyOS
- SSO forward_auth setup

**7.3 Authentik SSO**
- Full OIDC setup walkthrough

**7.4 Authelia SSO**
- Setup walkthrough

**7.5 Proxmox integration**
- API token creation
- Permissions required
- Snapshot + vzdump flow explanation
- Multi-node setup

**7.6 Proxmox Backup Server (monitoring)**
- Adding PBS as a monitor
- Reading PBS data alongside BackupOS jobs
- Migration path from PBS

**7.7 Borg monitoring**
- SSH setup
- Reading Borg repos

**7.8 Discord alerts**
**7.9 Slack alerts**
**7.10 Generic webhook alerts**
**7.11 Uptime Kuma push monitoring**

---

#### 8. Security

**8.1 Security overview**
- Threat model
- What BackupOS protects against, what it doesn't
- Defence-in-depth: auth + 2FA + encryption + audit

**8.2 Authentication**
- Password policy
- Session management
- API tokens

**8.3 Two-factor authentication**
- TOTP enrolment (walkthrough)
- Backup codes
- SMS backup
- Lost device recovery

**8.4 Encryption**
- At-rest: Restic repository encryption
- In-transit: TLS everywhere
- Agent-to-server: mutual TLS
- What the encryption password protects

**8.5 Key escrow**
- How it works (TOTP-gated password recovery)
- Threat model (what escrow does and doesn't protect)
- Enabling escrow on a repository
- Recovering a repo password
- Limitations

**8.6 Audit log**
- What's logged
- Hash chain tamper evidence
- Verifying integrity
- Exporting for compliance

**8.7 Compliance**
- GDPR considerations
- HIPAA considerations (not certified, but aligned)
- SOC2 notes for teams tier
- Data residency

**8.8 Security hardening checklist**
- Post-install hardening
- Reverse proxy + TLS
- Network segmentation
- Regular updates
- Secret rotation

**8.9 Reporting security issues**
- security@backupos.app
- PGP key
- Responsible disclosure timeline

---

#### 9. Release notes

One page per minor version, newest at top. Each includes: headline features, breaking changes, migration notes, known issues, full changelog link.

---

### 8.4 In-app docs layout

The in-app `/docs` route reuses the BackupOS shell (sidebar, topbar, profile popover all intact). Content area replaced with a three-pane docs layout.

```
┌──────────────┬────────────────────────────────┬──────────────┐
│ Docs sidebar │ Article content                │ Right rail   │
│ (240px)      │ (fluid, max 720px)             │ (220px)      │
│              │                                │              │
│ Section nav  │ ── Breadcrumb                  │ On this page │
│              │ ── H1 article title            │ (TOC)        │
│ Collapsible  │ ── Rendered MDX                │              │
│ tree         │                                │ ── Last       │
│              │                                │    updated    │
│              │                                │ ── Edit on    │
│              │                                │    GitHub     │
│              │                                │ ── Was this   │
│              │                                │    helpful?   │
└──────────────┴────────────────────────────────┴──────────────┘
```

**Docs sidebar (replaces main app nav inside `/docs`):**
- 240px, `--bg2`
- Top: search input (same ⌘K trigger) scoped to docs
- Section groups match the 9 top-level sections
- Each section expands to show pages
- Current page highlighted with `--accent-dim` fill
- Back to app button at top: `← Back to BackupOS`

**Article content:**
- Max width 720px, left-aligned within the main column
- Breadcrumb: `Docs / Concepts / Jobs`
- H1 at 28px, H2 at 22px, H3 at 18px, body 15px (one notch larger than app body for readability)
- Prose font: Inter (app standard)
- Code font: IBM Plex Mono
- Code blocks: `--surf2` fill, `--border` 1px, `--radius-sm`, 13px, syntax highlighted (Shiki with a custom OS Family theme — amber keywords on dark)
- Inline code: `--surf2` fill, `--radius-sm` 4px, mono, 0.9em
- Admonitions (callouts): four types — note (`--info`), tip (`--ok`), warning (`--warn`), danger (`--err`) — each with left 3px border in that colour, subtle dim fill, icon in corner
- Tables: same pattern as app tables, zebra off
- Images: `--radius`, subtle `--border` outline, caption below in `--fg-mute`
- Video embeds: 16:9 iframe wrapper with `--radius`
- Internal links: `--accent` with no underline, underline on hover
- External links: `--accent` with ↗ glyph appended

**Right rail:**
- Sticky "On this page" TOC (H2s and H3s)
- Highlighted item tracks scroll position
- Metadata at bottom: last updated date, "Edit on GitHub" link (opens `packages/docs-content/*.mdx` in repo), "Was this helpful?" thumbs up/down with optional text feedback

**Mobile / narrow:**
- Right rail collapses first (below 1100px)
- Sidebar collapses to hamburger (below 900px)
- Article content remains readable at any width

### 8.5 External site layout

`docs.backupos.app` uses the **same** three-pane layout and **same** MDX content, but wrapped in a marketing shell:

**Top chrome (replaces app shell):**
- 64px tall, `--bg2` fill, no border-bottom (match app)
- Left: BackupOS wordmark + "Docs" suffix in `--fg-mute`
- Centre: search input (320px, `--surf` fill) — **DocSearch/Algolia or built-in MiniSearch**
- Right: version switcher (e.g. `v1.0 ▾`), GitHub link, "Open BackupOS" button linking to app

**Footer:**
- Sitemap-style link list
- Copyright, licence, "Part of the Homelab OS Family" with hub link

**Versioning:**
- Current version at `/` (latest)
- Older versions at `/v0.9/`, `/v0.8/`, etc.
- Version dropdown shows latest + last 3 minor versions
- Unreleased content at `/next/` (main branch)

### 8.6 MDX content conventions

```
packages/docs-content/
├── nav.json                          # Single source of nav structure
├── 01-introduction/
│   ├── what-is-backupos.mdx
│   ├── why-backupos.mdx
│   ├── architecture-overview.mdx
│   └── terminology.mdx
├── 02-getting-started/
│   ├── install-self-hosted.mdx
│   └── ...
├── 04-how-to/
│   ├── backup-proxmox-vm.mdx
│   └── ...
└── shared/
    ├── snippets/                     # Reusable MDX fragments
    └── images/
```

**Frontmatter schema (enforced by schema validator on CI):**

```yaml
---
title: Back up a Proxmox VM
description: Configure BackupOS to back up a Proxmox VM using the hypervisor driver.
section: how-to
tags: [proxmox, vm, hypervisor]
updated: 2026-04-16
difficulty: intermediate         # beginner | intermediate | advanced
time_estimate: 10 min
see_also:
  - /concepts/sources
  - /how-to/backup-proxmox-lxc
  - /operations/proxmox-integration
---
```

**Custom MDX components available:**

- `<Callout type="warning">...</Callout>` — admonitions
- `<Steps>...</Steps>` with nested `<Step>...</Step>` — auto-numbered step walkthroughs
- `<Tabs>` / `<Tab>` — for "Linux / Windows" or "Docker / bare metal" content forks
- `<CodeGroup>` — multiple code blocks with language tabs
- `<ScreenshotFrame>` — image with app-chrome border for UI screenshots
- `<Terminal>` — styled terminal with optional `prompt="$"` and typed-effect animation
- `<ApiReference endpoint="backup.create">` — auto-generates endpoint docs from tRPC schema
- `<Video src="..." />` — 16:9 wrapper
- `<SeeAlso>` — auto-rendered "See also" block from frontmatter
- `<FeatureFlag version="1.2">` — wraps content that applies only to a version range

### 8.7 Deep linking from the app into docs

Every feature in BackupOS has a `?` help icon in its page header. Clicking it:
- Opens the relevant doc page in a slide-over drawer from the right (70% viewport width)
- Doesn't navigate away from the feature — user keeps their context
- Drawer has a `Open full docs ↗` button in the top-right to jump to `/docs/...` if they want the full tree

**Mapping** (sample — full map lives in `packages/docs-content/deep-links.json`):

| Feature | Help target |
|---|---|
| Dashboard health score | `/concepts/health-score` |
| New job wizard | `/how-to/create-a-backup-job` |
| App hook picker | `/concepts/sources` + scroll to App hooks section |
| Pre-flight modal | `/concepts/runs#preflight` |
| YAML spec editor | `/reference/yaml-restore-spec` |
| Verification page | `/concepts/verification` |
| Key escrow toggle (repo wizard) | `/security/key-escrow` |
| TOTP enrolment modal | `/security/two-factor-authentication` |
| DR Mode | `/how-to/use-dr-mode-during-an-incident` |
| Audit log | `/security/audit-log` |
| Cost forecast card | `/operations/capacity-planning` |

### 8.8 Writing style guide

Short guide for anyone contributing docs:

- **Voice:** Direct, operator-to-operator. No marketing fluff inside docs.
- **Person:** Second person ("you"), never "we" for procedures. "We" is OK in concept explanations where it invites the reader in.
- **Tense:** Present tense. "BackupOS creates a snapshot" not "BackupOS will create a snapshot".
- **Commands:** Always show complete commands the user can copy-paste. Prefer `$` for non-root and `#` for root, consistently.
- **Paths:** Absolute paths in monospace. Never "the config directory" without saying which one.
- **Assumptions:** State them upfront. "This guide assumes you have Docker installed and a Proxmox cluster reachable from the host."
- **Verify step:** Every how-to ends with a "Verify" section that tells the user how to confirm success.
- **Screenshots:** Use sparingly. A screenshot is a liability when the UI changes. Use only for complex layouts or genuine UI orientation. Label all screenshots with a date.
- **Never screenshot:** terminal output, config files, anything that should be a code block.
- **Length:** How-to guides stay under 400 words of prose (code doesn't count). Concepts can go longer. Reference pages are as long as they need to be.

### 8.9 Build priorities for docs

Phase into the existing 13-phase build order as follows:

- **Phase 1 (shell):** Scaffold `apps/docs` with matching shell + placeholder home page
- **Phase 2 (auth):** Write security docs (§8) alongside the feature build — the engineer building TOTP writes the TOTP doc
- **Phase 3 (dashboard):** Write concept docs for health score, KPIs
- **Each feature phase:** The engineer building the feature writes its how-to guide + concept page + reference section before the phase closes. No feature merges without docs.
- **Phase 12-13 (polish):** Final editorial pass on everything, fix cross-links, record screencasts for the top 5 how-tos.

Docs are not a "later" task — they ship with the feature. Make the CI pipeline fail if a new feature flag ships without a matching doc page.

---

## Part 9 — Three sample pages (fully written)

Sample pages to establish voice, length, and structure. These are drop-in ready for `packages/docs-content/`.

---

### Sample 1 — `02-getting-started/install-self-hosted.mdx`

```mdx
---
title: Install BackupOS (self-hosted)
description: Install BackupOS on your own infrastructure using Docker Compose, then complete the first-run setup.
section: getting-started
tags: [install, docker, self-hosted, setup]
updated: 2026-04-16
difficulty: beginner
time_estimate: 10 min
see_also:
  - /getting-started/enrol-your-first-agent
  - /getting-started/connect-your-first-repository
  - /operations/deployment-patterns
---

BackupOS runs as a single Docker container. This guide walks you from zero to a
logged-in admin account in under ten minutes.

## Prerequisites

You need:

- A Linux host with Docker 24+ and Docker Compose v2
- At least 2 GB of RAM and 10 GB of free disk space
- A hostname or IP you can reach from a browser

<Callout type="note">
BackupOS also runs behind a reverse proxy with TLS, which we recommend for any
permanent deployment. See
[Reverse proxy setup](/operations/deployment-patterns#reverse-proxy) when you're ready.
</Callout>

## 1. Create a project directory

<Terminal prompt="$">
mkdir -p ~/backupos && cd ~/backupos
</Terminal>

## 2. Create `docker-compose.yml`

<CodeGroup>
```yaml filename="docker-compose.yml"
services:
  backupos:
    image: ghcr.io/backupos/backupos:latest
    container_name: backupos
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
    environment:
      - BACKUPOS_BASE_URL=http://localhost:8080
      - BACKUPOS_TZ=Africa/Johannesburg
```
</CodeGroup>

Change `BACKUPOS_BASE_URL` to the URL you'll actually use. This value is used
for email links, SSO callbacks, and agent enrolment tokens. Getting it wrong
now means fixing it later.

## 3. Start the container

<Terminal prompt="$">
docker compose up -d
</Terminal>

Wait for the container to report healthy:

<Terminal prompt="$">
docker compose ps
</Terminal>

You should see `backupos` with status `Up (healthy)` within about 30 seconds.

## 4. Open the setup wizard

Browse to the URL you set in `BACKUPOS_BASE_URL`. You'll see the first-run
setup screen.

<Steps>
<Step>

**Create the admin account.** Full name, email, strong password. This account
has full access — treat it like a root credential.

</Step>
<Step>

**Set your instance name.** This appears in email subjects and TOTP issuer
labels (e.g. `BackupOS (Homelab ZA)`). Use something you'll recognise in your
authenticator app.

</Step>
<Step>

**Configure SMTP.** Required for alerts and password resets. Skip only if this
is a throwaway install — you'll get a banner reminding you to fix it.

</Step>
<Step>

**Enable TOTP.** Optional at setup, but strongly recommended. Scan the QR
code, enter a code to verify, save your backup codes somewhere safe.

</Step>
</Steps>

## Verify

You should now be looking at an empty BackupOS dashboard. It's empty because
you have no agents, no repositories, and no jobs yet. That's the next three
guides.

- [Enrol your first agent](/getting-started/enrol-your-first-agent)
- [Connect your first repository](/getting-started/connect-your-first-repository)
- [Run your first backup](/getting-started/run-your-first-backup)

## Troubleshooting

**Container fails to start:** Check `docker compose logs backupos`. The most
common cause is a permissions issue on `./data` — the container runs as UID
1000 by default.

**Can't reach the UI:** Make sure port 8080 isn't already in use
(`ss -tlnp | grep 8080`) and your firewall allows it.

**SMTP test fails:** BackupOS validates SMTP on save. If your provider
requires STARTTLS on port 587 with auth, double-check username and password.
See [SMTP configuration](/reference/environment-variables#smtp) for the full
env var reference.
```

---

### Sample 2 — `04-how-to/backup-postgresql-database.mdx`

```mdx
---
title: Back up a PostgreSQL database
description: Configure BackupOS to run consistent, restore-tested PostgreSQL backups using the app-aware pg_dump hook.
section: how-to
tags: [postgres, database, app-hook, backup]
updated: 2026-04-16
difficulty: intermediate
time_estimate: 8 min
see_also:
  - /concepts/sources
  - /how-to/restore-a-database-from-a-snapshot
  - /reference/app-hook-reference#postgresql
---

This guide configures a BackupOS job that takes **consistent** PostgreSQL
backups by calling `pg_dump` inside a pre-hook, then letting Restic deduplicate
the result.

If you back up the raw Postgres data directory instead, you get an inconsistent
snapshot that may or may not restore. Don't do that.

## Prerequisites

- A BackupOS agent is installed on the Postgres host — see
  [Enrol your first agent](/getting-started/enrol-your-first-agent)
- `pg_dump` is available on the host (`which pg_dump` returns a path)
- A Postgres role with `CONNECT`, `USAGE ON SCHEMA`, and `SELECT` on everything
  you want to back up. For full-cluster dumps, the role needs `pg_read_all_data`
  or `REPLICATION`.
- A BackupOS repository to write into — see
  [Connect your first repository](/getting-started/connect-your-first-repository)

## Create a dedicated backup role

Using a dedicated role means the backup credential can't be used to modify
data, and you can rotate it without touching anything else.

<Terminal prompt="$">
sudo -u postgres psql
</Terminal>

```sql
CREATE ROLE backupos_ro WITH LOGIN PASSWORD 'change-me';
GRANT pg_read_all_data TO backupos_ro;
```

## Configure the job

<Steps>
<Step>

**Open the new job wizard.** Jobs page → `+ New job`.

</Step>
<Step>

**Pick source type: Database.** Select `PostgreSQL`.

</Step>
<Step>

**Fill in connection details:**

| Field | Value |
|---|---|
| Host | `localhost` (or reachable hostname) |
| Port | `5432` |
| Database | `postgres` for cluster-wide, or a specific DB |
| User | `backupos_ro` |
| Password | the password you set above |
| Scope | `All databases` or `Specific databases` |

<Callout type="tip">
Use `All databases` if you want one snapshot to contain everything. Use
`Specific databases` if you want different schedules per DB (e.g. hourly
for the busy one, nightly for the rest).
</Callout>

</Step>
<Step>

**Pick a target repository.** If this is sensitive data, prefer an encrypted
repository with [key escrow](/security/key-escrow) enabled.

</Step>
<Step>

**Set a schedule.** For most production Postgres, `0 2 * * *` (2am nightly)
is a safe default. High-traffic databases deserve hourly:
`0 * * * *`.

</Step>
<Step>

**Review and save.** BackupOS runs a pre-flight check automatically, verifying
`pg_dump` is callable and your role can connect. Fix any reds before saving.

</Step>
</Steps>

## Run it once manually

Don't wait for the schedule to find out it's broken. On the job detail page,
click **Run now**.

Watch the run log. You should see:

```
[pre-hook] pg_dump --format=custom --file=/tmp/backupos-xxxx.dump ...
[pre-hook] pg_dump completed in 4.2s (12.3 MB)
[backup]   restic backup /tmp/backupos-xxxx.dump ...
[backup]   snapshot abc123 created
[post-hook] cleanup /tmp/backupos-xxxx.dump
```

If all three phases are green, you have a working backup.

## Set up verification

A backup that's never been restored is a rumour. Configure
[scheduled restore verification](/how-to/set-up-scheduled-restore-verification)
against this job. For Postgres, use a validation hook like:

```sh
psql -d backupos_test -c "SELECT COUNT(*) FROM users;"
```

If the count looks sane, you have a real backup.

## Verify

After the first successful run:

1. The job shows a green status badge on the Jobs list
2. A snapshot appears on the Snapshots page, tagged with the job name
3. The run log shows pre-hook + backup + post-hook all green
4. Repository size increased by roughly the dump size (first run — subsequent
   runs dedupe heavily)

## Next steps

- [Restore a database from a snapshot](/how-to/restore-a-database-from-a-snapshot)
- [Set up scheduled restore verification](/how-to/set-up-scheduled-restore-verification)
- [Tighten retention to save storage costs](/how-to/tighten-retention-to-save-storage-costs)
```

---

### Sample 3 — `06-operations/upgrading-backupos.mdx`

```mdx
---
title: Upgrading BackupOS
description: How to safely upgrade your self-hosted BackupOS instance, including pre-upgrade checks, agent compatibility, and rollback.
section: operations
tags: [upgrade, ops, maintenance]
updated: 2026-04-16
difficulty: intermediate
time_estimate: 15 min
see_also:
  - /operations/database-maintenance
  - /operations/upgrading-agents
  - /release-notes
---

BackupOS follows semantic versioning: `MAJOR.MINOR.PATCH`. Patch upgrades are
always safe. Minor upgrades may add non-breaking features. Major upgrades can
change the database schema and require reading the migration notes before you
pull.

This guide covers the self-hosted upgrade path. Cloud is upgraded automatically.

## Before you upgrade

<Callout type="danger">
Back up BackupOS's own database before every upgrade. If a migration fails, the
only clean recovery is restoring the DB file.
</Callout>

<Steps>
<Step>

**Read the release notes.** Visit [Release notes](/release-notes) and read
every version between your current one and the target. Look for:

- **Breaking changes** — rare, but real
- **Required actions** — e.g. "Run `backupos migrate agents` after upgrade"
- **Agent compatibility** — the minimum agent version the new server supports

</Step>
<Step>

**Check agent compatibility.** On the Agents page, look at every agent's
version column. If any agent is older than the target server's minimum
supported version, upgrade those agents first. See
[Upgrading agents](/operations/upgrading-agents).

</Step>
<Step>

**Back up the BackupOS database.**

<Terminal prompt="$">
docker compose exec backupos backupos db:backup /data/backups/pre-upgrade-$(date +%F).db
</Terminal>

The backup is written inside the mounted `/data` volume. Copy it somewhere
off-host if you're paranoid (you should be).

</Step>
<Step>

**Check current version and running jobs.**

<Terminal prompt="$">
docker compose exec backupos backupos version
</Terminal>

Look at the Jobs page. If any job is currently running, either wait for it to
finish or accept it will be interrupted and retried after upgrade.

</Step>
</Steps>

## Perform the upgrade

<Steps>
<Step>

**Pull the new image.**

<Terminal prompt="$">
docker compose pull backupos
</Terminal>

</Step>
<Step>

**Recreate the container.**

<Terminal prompt="$">
docker compose up -d
</Terminal>

The container starts, runs any pending database migrations automatically, then
begins accepting traffic. Migrations typically complete in under 10 seconds.

</Step>
<Step>

**Watch the logs during startup.**

<Terminal prompt="$">
docker compose logs -f backupos
</Terminal>

Look for:

```
[migrate] applying 2026_04_verification_tables.sql
[migrate] applying 2026_04_audit_hash_chain.sql
[migrate] 2 migrations applied in 412ms
[http]    listening on :8080
[agents]  42 agents reconnected
```

Ctrl-C once you see agents reconnected and HTTP is listening.

</Step>
<Step>

**Run post-upgrade checks.**

- Open the dashboard. Health score should be roughly what it was before.
- Open the Agents page. All previously-online agents should reconnect within 60 seconds.
- Trigger one job manually. Confirm it runs and succeeds.
- Check the Audit log. There should be `system.upgrade` events recorded.

</Step>
</Steps>

## Agent compatibility matrix

| Server version | Minimum agent | Recommended agent |
|---|---|---|
| 1.2.x | 1.0.0 | 1.2.x |
| 1.1.x | 1.0.0 | 1.1.x |
| 1.0.x | 1.0.0 | 1.0.x |

Agents stay compatible within a major version. Major upgrades of the server
may require coordinated agent upgrades — the release notes always say so
explicitly.

## Rolling back

If something is wrong after upgrade and you need to roll back:

<Steps>
<Step>

**Stop the container.**

<Terminal prompt="$">
docker compose down
</Terminal>

</Step>
<Step>

**Restore the pre-upgrade DB backup.**

<Terminal prompt="$">
cp /data/backups/pre-upgrade-YYYY-MM-DD.db /data/backupos.db
</Terminal>

</Step>
<Step>

**Pin to the previous image version** in `docker-compose.yml`:

```yaml
image: ghcr.io/backupos/backupos:1.1.4   # previous version
```

</Step>
<Step>

**Restart.**

<Terminal prompt="$">
docker compose up -d
</Terminal>

</Step>
</Steps>

<Callout type="warning">
Rolling back after a major upgrade that introduced a schema change requires
the DB backup from before the upgrade. Forward-compat is automatic; backward-compat is not.
</Callout>

Once rolled back, file an issue at
[github.com/backupos/backupos/issues](https://github.com/backupos/backupos/issues)
with the failure mode.

## Upgrade cadence recommendations

- **Patch releases (1.2.3 → 1.2.4):** Apply within a week. These are bug fixes.
- **Minor releases (1.2 → 1.3):** Apply within a month. Read the notes, upgrade
  during a maintenance window.
- **Major releases (1.x → 2.0):** Treat as a project. Read notes, test on a
  staging instance first if you have one, plan agent upgrades.

## Verify

Your BackupOS instance is cleanly upgraded when:

- `backupos version` reports the target version
- All agents are reconnected and reporting healthy
- At least one job has run successfully post-upgrade
- The audit log contains a `system.upgrade` event with old and new version
- The health score is stable or improved
```

---

### 8.10 OS Family docs compliance checklist

- ✅ Same shell, same tokens — docs feel like part of the product, not a bolt-on
- ✅ Inter for prose, IBM Plex Mono for code and values
- ✅ `--accent` used for internal links and active nav
- ✅ Callouts use semantic colours (info/ok/warn/err) consistent with alerts
- ✅ In-app search unified with global ⌘K
- ✅ Deep links from features into docs, drawer style, no context loss
- ✅ Single MDX source, two renderers
- ✅ Frontmatter schema enforced in CI
- ✅ "Docs ship with feature" build rule — no feature merges without docs
- ✅ Versioned external site with version switcher
- ✅ Edit-on-GitHub for community contributions
