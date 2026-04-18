# BackupOS — Website Specification
**URL:** backupos.app
**Date:** April 2026 | **Author:** Darius
**Purpose:** Marketing + docs + download site for BackupOS
**Audience:** Homelab operators (Proxmox users, PBS migrants), self-hosters,
small teams running mixed Linux/Windows stacks
**Goal:** Convert visitor → self-hosted installer OR cloud trial

---

## 1. Design Direction

### Aesthetic
**Industrial reliability meets precision engineering.** Think Restic's
documentation page meets Tailscale's marketing site. Dark, technical,
trustworthy. The product protects critical data — the site should feel
like it was built by someone who takes that seriously.

This is NOT:
- Corporate SaaS with gradient hero backgrounds
- Playful/bubbly (this is backup software, not a todo app)
- Cluttered feature lists (quality over quantity)

This IS:
- Dark background — engineers trust dark UIs for serious tools
- Mono headings — signals technical precision
- Blue accent — distinct from Infra OS (green) and MxWatch (blue-gray)
- Clean data density — numbers matter, show them prominently

### Palette (matches the app exactly)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0B0E14` | Page background |
| `--bg2` | `#111520` | Section alternates |
| `--surf` | `#1C2333` | Cards, panels |
| `--blue` | `#4A9EFF` | Primary accent, CTAs |
| `--blue-dim` | `#4A9EFF18` | Subtle blue fills |
| `--blue-border` | `#4A9EFF40` | Blue borders |
| `--green` | `#00C896` | Success, healthy status |
| `--amber` | `#F5A623` | Warnings |
| `--red` | `#F55A5A` | Errors, failures |
| `--text` | `#E8EDF5` | Primary text |
| `--text2` | `#8892A4` | Secondary text |
| `--text3` | `#4A5568` | Muted labels |
| `--border` | `#1E2738` | Default borders |
| `--border2` | `#2A3450` | Hover/emphasis borders |

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display headings | JetBrains Mono | 700 | 40–48px |
| Section labels | JetBrains Mono | 500 | 10–11px |
| Body copy | Outfit | 300–400 | 14–17px |
| Code / CLI | JetBrains Mono | 400 | 11–13px |
| UI labels | JetBrains Mono | 500 | 9–12px |

### Logo

**Primary mark:** 2×2 grid of squares with varying opacity — represents
nodes in a backup matrix. Top-left full opacity, others fading (0.3–0.7).
Placed in a rounded rect with `#4A9EFF18` fill and `#4A9EFF40` border.

**Wordmark:** `Backup` (text, regular weight) + `OS` (blue accent, bold)

**Favicon:** The 2×2 grid mark alone, blue on dark.

### Motion
- Hero preview: backup run progress bar animates on load (0% → 72%)
- Section entry: fade-up with 80ms stagger per element
- Job status dots: slow pulse animation on "running" state
- Hover: 150ms ease on all interactive elements, border-color shift
- CLI command: typing animation on the install command

### Differentiating detail
- The hero preview shows your real jobs — gitbay-dev, stalwart, llm-tools
- Every storage cost example uses real prices ($0.015/GB R2, $0.006/GB B2)
- The PBS comparison table uses real PBS limitation language
- The install command uses a real-looking token format (`bos_enroll_xxx`)

---

## 2. Site Structure

```
backupos.app/
├── /                    # Landing page (this spec)
├── /vs-pbs              # Detailed PBS comparison and migration guide
├── /pricing             # Full pricing page with storage cost calculator
├── /docs                # Documentation (MDX, separate)
├── /changelog           # Product changelog
├── /blog                # Launch posts, technical deep-dives
└── /cloud               # BackupOS Cloud landing (managed service)
```

---

## 3. Landing Page — Full Spec

### Navigation

**Sticky, dark background, 0.5px bottom border, z-index 10**

Left: Logo mark + BackupOS wordmark + version badge `v1.0`

Center: Features · vs PBS · Pricing · Docs · GitHub

Right:
- `View on GitHub ↗` (text link, muted)
- `BackupOS Cloud →` (outlined button, blue text)
- `Download →` (filled blue button)

Mobile: hamburger → full-screen dark overlay menu

---

### Section 1: Hero

**Layout:** Centered, max-width 620px text block, full-width dashboard
preview below, 72px top padding.

**Eyebrow:**
```
— UNIFIED HOMELAB BACKUP
```
(JetBrains Mono, 11px, #4A9EFF, letter-spacing 0.1em, flanked by
20px horizontal lines in #4A9EFF)

**Headline:**
```
One backup platform.
Every host,
always verified.
```
(JetBrains Mono, 44px, 700. "Every host," in #4A5568. "always verified."
in #4A9EFF)

**Subheadline:**
```
Proxmox VMs, Linux bare metal, Windows VSS, Docker containers,
databases — all backed by Restic's content-addressed engine.
No chains. No corruption. No mystery failures.
```
(Outfit, 17px, 300, #8892A4, max-width 520px, line-height 1.65)

**CTAs (flex row, centered):**
- `Download BackupOS →` — filled blue button, JetBrains Mono 13px bold
- `BackupOS Cloud →` — amber-tinted outlined button
- `View on GitHub ↗` — muted outlined button

**Below CTAs:**
```
BackupOS — self-hosted · MIT · free forever  |  BackupOS Cloud — managed · $9/mo
```
(JetBrains Mono, 12px, #4A5568)

**Hero dashboard preview:**
Dark browser chrome (traffic light dots + URL bar showing
`backupos.local:3000 — dashboard — homelab`).

Inside: mini dashboard with:
- 4 metric cards: 14 jobs / 8 agents / 28/28 last 24h / 284 GB
- 4 recent backup run rows:
  - `gitbay-dev (VM 101)` · Proxmox VM · vzdump → R2 · 2h ago · `success` (green)
  - `gitbay-postgres` · PostgreSQL · pg_dump → R2 · 2h ago · `success`
  - `dev-workstation` · Windows · VSS → R2 · 4h ago · `success`
  - `llm-tools (LXC 200)` · Proxmox LXC · vzdump · now · `running` (blue pulse)
- Storage bar: `homelab-r2 · 221 GB · ~$3.32/mo`

---

### Section 2: The problem

**Label:** `// the problem`

**Headline:**
```
Your backup software
is lying to you.
```

**Two-column layout:**

Left — "What backup software tells you":
```
✓ Backup completed successfully
✓ All files backed up
✓ No errors detected
```
(Green checkmarks, monospace, looks reassuring)

Right — "What's actually happening":
```
✗ Duplicity incremental chain broken at step 7
✗ PostgreSQL data directory copied mid-transaction
✗ Windows VSS not invoked — open files skipped
✗ No restore has ever been tested
```
(Red crosses, monospace, brutal honesty)

**Paragraph below:**
```
Most operators discover their backups are broken the moment
they need them. BackupOS was built to prevent that — with
content-addressed storage that can't corrupt, application-aware
hooks that know how to safely capture live databases, and YAML
restore specs you can test before disaster strikes.
```

---

### Section 3: vs Proxmox PBS

**Label:** `// for proxmox users`

**Headline:**
```
Everything PBS does,
plus everything it doesn't.
```

**Subheadline:**
```
Running PBS for your VMs? BackupOS can replace it — and also
protect the Linux boxes, Windows machines, Docker containers,
and databases that PBS ignores. Migrate job by job. No big-bang
cutover required.
```

**Three-column comparison cards:**

**Column 1 — Proxmox PBS:**
Header: `Proxmox PBS` · badge: `Proxmox only`

```
✓ Proxmox VM/LXC backup
✓ Incremental-forever
✓ Deduplication
✗ Linux bare metal
✗ Windows / VSS
✗ Database-aware (pg_dump, mysqldump)
✗ Docker/Podman containers
✗ YAML restore specs
✗ S3 / R2 / B2 targets
✗ Cost monitoring
```

**Column 2 — BackupOS (featured, blue border):**
Header: `BackupOS` · badge: `Everything`

```
✓ Proxmox VM/LXC via API
✓ Incremental-forever (Restic)
✓ Deduplication (content-addressed)
✓ Linux bare metal agent
✓ Windows VSS agent
✓ pg_dump, mysqldump, BGSAVE, SQLite
✓ Docker/Podman volumes + hooks
✓ YAML restore specs + testing
✓ S3, R2, B2, SFTP, local, rclone
✓ Storage cost analytics
```

**Column 3 — Migration path:**
Header: `PBS + BackupOS` · badge: `Gradual`

Step-by-step migration flow:
```
→ Add BackupOS alongside PBS
→ Monitor PBS health from BackupOS
→ Add Linux/Windows agents first
→ Migrate VM jobs one by one
→ Add database hooks
→ Write restore specs
→ Run restore tests
→ Decommission PBS
```

**CTA below:**
`Read the PBS migration guide →` (links to /vs-pbs)

---

### Section 4: Integration with Infra OS

**Label:** `// better together`

**Headline:**
```
Pair with Infra OS.
Close the loop.
```

**Subheadline:**
```
BackupOS is a standalone product. But paired with Infra OS, it
becomes something more — every node in your topology shows backup
coverage, unprotected VMs surface as drift events, and every
deployment triggers an automatic pre-update snapshot.
```

**Three feature cards (horizontal row):**

**Card 1 — Topology coverage:**
```
Backup coverage in the topology view

Infra OS knows every VM and service in your stack.
BackupOS enriches that view — green nodes are covered,
amber nodes are running, red nodes have no backup job.
Unprotected nodes are infrastructure debt, surfaced
alongside config drift.
```
Mock topology row:
```
gitbay-dev (VM 101)  ● running  Backup: ● 2h ago · 4.2 GB
stalwart (VM 112)    ● running  Backup: ⚠ no backup job   ← drift
llm-tools (LXC 200) ● running  Backup: ↻ running now
```

**Card 2 — Shared agent:**
```
One install. Both platforms.

The ios-agent on each node serves both Infra OS and
BackupOS simultaneously. One binary, one install command,
one thing to maintain.
```
CLI snippet:
```bash
curl -fsSL https://infraos.local/install.sh | bash -s -- \
  --ios-token ios_xxx \
  --backupos-token bos_xxx
```

**Card 3 — Safe updates:**
```
Two rollback points on every deployment.

ios update splice-worker → pre-update BackupOS snapshot
→ Proxmox VM snapshot → deploy → health check. If it
fails: restore Proxmox snapshot instantly. If the node
itself fails: restore from BackupOS offsite snapshot.
One command. Zero data loss.
```
Mock update flow:
```
ios update splice-worker
  ✓ BackupOS: pre-update snapshot (abc123)
  ✓ Proxmox: VM snapshot taken
  ✓ Agent: docker pull + restart
  ✓ Health check: passed
  → Deployed v1.3. Two rollback points retained.
```

**CTA:** `Learn about Infra OS →` (links to infraos.app)

---

### Section 5: Features

**Label:** `// features`

**Headline:**
```
Built for the failure mode
you discover on restore day.
```

**Six feature cards (2×3 grid):**

**[1] Restic engine**
Tag: `RESTIC ENGINE`
Title: Content-addressed. No chains to corrupt.
Body: Every chunk SHA-256 verified. Same data = same hash.
No incremental chains that break when one piece goes missing.
Every snapshot independently valid. `restic check` verifies the
entire repository in minutes.

**[2] Proxmox backup**
Tag: `PROXMOX API`
Title: vzdump → Restic. No PBS required.
Body: BackupOS calls the Proxmox API directly — quiesced snapshot,
vzdump, stream to Restic. Same consistency model as PBS. Back up
to R2, B2, or SFTP instead of a local datastore you also have to back up.

**[3] Windows VSS**
Tag: `WINDOWS VSS`
Title: Consistent Windows backups. One PowerShell command to install.
Body: The Windows agent runs Restic with `--use-fs-snapshot` —
VSS shadow copy, no open file issues, no stopped services.
Full system state captured. Install in 30 seconds.

**[4] Application-aware hooks**
Tag: `APP HOOKS`
Title: Postgres, MySQL, Redis — all consistent.
Body: Pre-hook runs `pg_dump`, `mysqldump --single-transaction`,
or Redis `BGSAVE` before Restic touches the filesystem.
Post-hook cleans up. Your database backup is a consistent dump,
not a torn copy from a live write.

**[5] YAML restore specs**
Tag: `RESTORE SPECS`
Title: Your restore procedure is a file.
Body: Define your full restore in YAML — database restore, file
restore, container restart, health check. Run it on a schedule to
prove it works before you need it. Version control it alongside
your infrastructure code.

**[6] Storage cost analytics**
Tag: `COST ANALYTICS`
Title: Know exactly what you're paying, and what you could save.
Body: BackupOS tracks storage size, growth rate, and estimated
monthly cost per repository. When switching backends would save
more than $5/mo, it tells you. Cloudflare R2 zero-egress vs
Backblaze B2 cheapest-storage — the numbers are there.

---

### Section 6: Storage backends

**Label:** `// storage backends`

**Headline:**
```
Back up to anywhere.
Restore from anywhere.
```

**Subheadline:**
```
Restic supports every major cloud storage backend natively.
BackupOS adds cost tracking, growth alerts, and a recommendation
engine that tells you when switching would save you money.
```

**Backend grid (3×2):**

| Backend | Storage/GB/mo | Egress/GB | Highlight |
|---------|--------------|-----------|-----------|
| Cloudflare R2 | $0.015 | **$0** | Recommended — zero egress means free restores |
| Backblaze B2 | $0.006 | $0.01 | Cheapest storage — good for large cold archives |
| Wasabi | $0.0069 | $0 | Zero egress, 90-day min retention (note!) |
| AWS S3 | $0.023 | $0.09 | Most compatible — expensive egress |
| Hetzner Storage Box | $0.0057 | $0 | Best value in EU |
| SFTP / local | $0 | $0 | Your NAS, another VPS, external drive |

**Recommendation panel below:**
Dark card with blue border:
```
Not sure which to pick?

For most homelab operators: Cloudflare R2.
Zero egress means a 300GB restore costs $0, not $27.
At 300GB stored: ~$4.50/mo. Switch if you're currently
paying more.

BackupOS will tell you when your usage pattern suggests
a cheaper backend. You don't have to calculate it yourself.
```

---

### Section 7: Hypervisor support

**Label:** `// hypervisors`

**Headline:**
```
Not just Proxmox.
```

**Subheadline:**
```
BackupOS backs up any VM — with or without an agent inside.
The hypervisor driver layer handles the snapshot mechanics.
The application hook layer handles what's running inside.
```

**Four columns:**

**Proxmox (V1)**
- VMs and LXCs via Proxmox API
- vzdump → Restic pipeline
- Same consistency model as PBS
- App hooks via in-VM agent (optional)
- Badge: `V1 — shipping`

**XCP-ng (V2)**
- VMs via Xen Orchestra API or XAPI
- Snapshot → VHD export → Restic
- Badge: `V2 — roadmap`

**VMware (V2)**
- vSphere API
- VMDK snapshot export → Restic
- Badge: `V2 — roadmap`

**KVM bare metal**
- Linux agent on the host
- Backs up VM disk files directly
- No management layer required
- Badge: `V1 via agent`

---

### Section 8: YAML restore spec

**Label:** `// yaml restore specs`

**Headline:**
```
Your restore procedure
is a file.
```

**Subheadline:**
```
Not a runbook in Notion. Not tribal knowledge. A YAML file
in your git repo that you can run, test, and version.
```

**Full YAML example (dark code panel, monospaced):**
```yaml
# restore-specs/gitbay-full.yaml
name: gitbay-full
description: Full restore of GitBay service
repository: homelab-r2

steps:
  - name: Restore database
    type: database_restore
    app: postgres
    snapshot_path: /tmp/backupos-pg-gitbay.sql.gz
    target:
      container: gitbay-db
      database: gitbay
    on_failure: abort

  - name: Restore application files
    type: filesystem_restore
    snapshot_path: /data/gitbay/repos
    target_path: /data/gitbay/repos
    on_failure: abort

  - name: Restart service
    type: shell
    command: docker compose up -d
    working_dir: /opt/gitbay
    on_failure: abort

  - name: Verify health
    type: http_check
    url: https://gitbay.dev/api/health
    expected_status: 200
    timeout_seconds: 60
    on_failure: notify_only
```

**Three callout rows below the code:**
- `on_failure: abort` — if this step fails, halt and report. Nothing left in a broken half-state.
- `on_failure: notify_only` — health check failure sends an alert but doesn't count as restore failure.
- `type: http_check` — the restore spec verifies the service is actually responding, not just that files landed.

**CTA:** `Read the restore spec reference →` (links to /docs/restore-specs)

---

### Section 9: Pricing

**Label:** `// pricing`

**Headline:**
```
Free to self-host.
Cloud when you need it.
```

**Subheadline:**
```
BackupOS is MIT licensed. Unlimited agents, unlimited jobs,
unlimited backup targets. We charge for managed hosting
and teams features, not for nodes.
```

**Three pricing cards:**

**BackupOS — $0:**
Tier label: `BACKUPOS`
Price: $0
Period: forever · MIT · self-hosted
Features:
- ✓ Unlimited agents (Linux + Windows)
- ✓ All source types incl. Proxmox VM
- ✓ All application hooks
- ✓ YAML restore specs
- ✓ All storage backends
- ✓ Storage cost analytics
- ✓ 1 admin user
CTA: `View on GitHub →` (outlined)

**BackupOS Cloud Solo — $9/mo (featured):**
Tier label: `BACKUPOS CLOUD SOLO`
Price: $9
Period: /mo · managed hosting
Features:
- ✓ Everything in free
- ✓ Hosted at backupos.app
- ✓ Up to 5 agents
- ✓ Email + Slack alerts
- ✓ 90-day run history
- ✓ Managed agent updates
CTA: `Start free trial →` (filled blue)

**BackupOS Cloud Teams — $29/mo:**
Tier label: `BACKUPOS CLOUD TEAMS`
Price: $29
Period: /mo · multi-user
Features:
- ✓ Everything in Solo
- ✓ Unlimited agents
- ✓ Multi-user + RBAC
- ✓ Scheduled restore tests
- ✓ API access
- ✓ Audit log
CTA: `Start free trial →` (outlined)

---

### Section 10: Install

**Label:** `// get started`

**Headline:**
```
Up and running
in 5 minutes.
```

**Three install paths (tabs — Linux / Windows / Docker):**

**Linux (selected):**
```bash
# 1. Install BackupOS server
docker run -d --name backupos \
  -p 3000:3000 \
  -v backupos_data:/app/data \
  -e ENCRYPTION_KEY=your-32-char-key \
  ghcr.io/yourusername/backupos:latest

# 2. Open the dashboard
open http://localhost:3000

# 3. Enroll your first agent
curl -fsSL http://localhost:3000/install.sh | bash -s -- \
  --token bos_enroll_xxxxxxxxxxxxxxxx
```

**Windows:**
```powershell
# Run in PowerShell as Administrator
irm http://backupos.local/install.ps1 | iex `
  -Token bos_enroll_xxxxxxxxxxxxxxxx
# Installs as Windows Service. VSS-ready immediately.
```

**Docker Compose:**
```yaml
services:
  backupos:
    image: ghcr.io/yourusername/backupos:latest
    ports: ["3000:3000"]
    volumes: [backupos_data:/app/data]
    environment:
      ENCRYPTION_KEY: your-32-char-key
volumes:
  backupos_data:
```

**Below tabs:**
```
Then open http://localhost:3000 and follow the setup wizard.
Add your first repository, create a backup job, run it.
Total time: under 5 minutes.
```

CTAs: `[Read the full docs →]` `[View on GitHub ↗]`

---

### Section 11: Footer

**Four columns:**

**Col 1 — Brand:**
Logo + wordmark
```
Unified homelab backup.
Self-hosted, MIT, free forever.
BackupOS Cloud from $9/mo.
```
`© 2026 BackupOS. MIT Licensed.`

**Col 2 — Product:**
Features · vs PBS · Pricing · Changelog · Roadmap · Cloud

**Col 3 — Resources:**
Documentation · Agent setup · Restore specs · Storage backends · GitHub · Blog

**Col 4 — Community:**
r/homelab · r/selfhosted · Proxmox forum · GitHub Discussions

**Footer bottom bar:**
```
backupos.app · MIT Licensed · Built for homelab operators
who've been burned by Duplicity.
```

---

## 4. /vs-pbs — PBS Comparison & Migration Guide

### Purpose
Dedicated page for Proxmox users considering BackupOS as a PBS
replacement. Longer form, more technical, conversion-focused.

### Sections
1. Side-by-side feature table (full, all rows)
2. Why Restic vs PBS storage format
   - Content-addressing vs fixed-size chunks
   - No datastore corruption risk
   - Back up to anything, not just a PBS datastore
3. Step-by-step migration guide
   - Week 1: Install BackupOS, add PBS as monitor
   - Week 2: Set up Restic repository (R2 or B2 recommended)
   - Week 3: Migrate VM jobs one by one, run both in parallel
   - Week 4: Add Linux/Windows agents and database hooks
   - Week 5: Write restore specs, test them
   - Week 6: Decommission PBS
4. FAQ
   - Can I migrate existing PBS snapshots to Restic? (No, but you can
     keep PBS running during transition and snapshot clean VMs)
   - Does BackupOS support PBS datastores as a target? (No — PBS
     proprietary format. Use R2/B2/SFTP instead)
   - Is the backup speed comparable to PBS? (Comparable. First backup
     is full, subsequent are incremental via Restic chunking)

---

## 5. /pricing — Full Pricing Page

### Sections
1. Pricing cards (same as landing)
2. **Storage cost calculator** — interactive widget
   - Sliders: total data size (GB), weekly growth (GB), monthly restores (GB)
   - Output: estimated monthly cost per backend, ranked cheapest to most expensive
   - Highlights the egress cost difference on restore
3. FAQ
   - Is the self-hosted version really unlimited? Yes. No node limits, no job limits,
     no storage limits. MIT licensed.
   - What counts as an "agent"? One agent binary installed on one host.
   - Can I use BackupOS Cloud with my own S3 bucket? Yes — you bring your own
     storage credentials. We charge for hosting BackupOS itself, not storage.
   - What happens if I exceed 5 agents on Solo? We'll email you and give you
     30 days before enforcing. No surprise cut-offs.

---

## 6. Claude Code Kickoff Prompt (Website)

```
Build the BackupOS marketing website for backupos.app.

Read backupos-website-spec.md completely before writing any code.

Tech: Next.js 15 (App Router), Tailwind CSS v4, static export
for Cloudflare Pages.
Fonts: JetBrains Mono + Outfit from Google Fonts.
Theme: Dark. bg #0B0E14, surface #1C2333, accent #4A9EFF, text #E8EDF5.

Build these components first:
- NavBar — dark sticky, blue CTA, version badge, GitHub link
- LogoMark — 2×2 grid of squares with fading opacity in blue-tinted container
- DashboardPreview — browser chrome + mini dashboard with job rows and metric cards
- CLIPanel — dark terminal with colour-coded output (blue prompt, green ✓, red ✗,
  amber ⚠, gray comments). Typing animation on install command.
- ComparisonCard — PBS vs BackupOS vs Migration path, 3-column layout
- FeatureCard — tag + title + body
- YAMLPanel — dark code panel with YAML syntax highlighting (no Shiki — use
  styled spans with colour classes)
- PricingCard — dark, 3-column, featured variant (blue 1.5px border)
- BackendGrid — storage backend comparison with price per GB/mo and egress
- InstallTabs — Linux / Windows / Docker tabs with CLI panels
- Footer — 4-column dark footer

Build the landing page (app/page.tsx) with sections in this order:
1. Hero — eyebrow + headline + subheadline + CTAs + DashboardPreview
2. Problem — before/after split (backup software lies)
3. vs PBS — 3-column comparison cards
4. Infra OS integration — 3 feature cards (topology, shared agent, safe updates)
5. Features — 2×3 grid
6. Storage backends — backend grid + recommendation panel
7. Hypervisor support — 4-column grid
8. YAML restore spec — code panel + callouts
9. Pricing — 3 cards
10. Install — tabbed CLI panels
11. Footer

Also build:
- /vs-pbs — full PBS comparison and migration guide
- /pricing — pricing page with interactive storage cost calculator
  (sliders for data size, weekly growth, monthly restores →
   ranked backend cost table, updated in real-time with JavaScript)

Use the exact copy and real data from the spec throughout.
next.config.ts: output: 'export' for Cloudflare Pages.
Add SEO metadata — title, description, og:image for each page.
Ask before deviating from the spec.
```

---

## 7. SEO & Metadata

### Landing page
```
title: BackupOS — Unified Homelab Backup
description: Back up Proxmox VMs, Linux bare metal, Windows (VSS),
Docker containers, and databases from one dashboard. Built on Restic.
Free to self-host. No chains, no corruption.
og:image: /og/home.png (dark hero with dashboard preview)
```

### /vs-pbs
```
title: BackupOS vs Proxmox PBS — Migration Guide
description: Everything PBS does, plus Linux, Windows, Docker,
and databases. Migrate from PBS job by job. No big-bang cutover.
```

### /pricing
```
title: BackupOS Pricing — Free to self-host. $9/mo cloud.
description: BackupOS Community is MIT licensed and free forever.
BackupOS Cloud from $9/mo. No node limits, no job limits.
```

---

## 8. Cloudflare Pages Deployment

```
# Build command
pnpm build

# Output directory
out/

# Environment variables (none required for static site)

# Custom headers (_headers file in /public)
/install.sh
  Content-Type: text/x-shellscript
  Content-Disposition: inline

/install.ps1
  Content-Type: text/plain
  Content-Disposition: inline
```

Install scripts are static files in `/public/` for the marketing site.
They contain placeholder tokens (`__BACKUPOS_URL__`, `__ENROLLMENT_TOKEN__`)
that the actual BackupOS server replaces when generating enrollment commands.
The marketing site just shows the pattern — actual enrollment tokens come
from the running BackupOS instance.
