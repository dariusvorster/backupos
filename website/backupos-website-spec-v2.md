# BackupOS — Website Specification v2

**URL:** backupos.app
**Supersedes:** backupos-website-spec.md (v1)
**Date:** April 2026
**Purpose:** Marketing + docs + download + cloud signup for BackupOS
**Audience:** Homelab operators, SMB IT managers, MSPs, PBS migrants
**Goal:** Convert visitor → self-hosted installer OR cloud trial OR teams demo

## What changed from v1

- **Tokens realigned to OS Family system.** Amber accent (#F5A623), Inter + IBM Plex Mono, surfaces `#0A0A0A`/`#0F0F0F`/`#141414`/`#1A1A1A`. v1 used a blue/Outfit/JetBrains stack that diverged from the app and the family — that's corrected here.
- **Docs fully spec'd.** Previously one line, now a complete `/docs` section mirroring Part 8 of the app UI spec v2.
- **Cloud page fully spec'd.** Previously one bullet, now a full dedicated marketing + signup flow for BackupOS Cloud Solo and Teams.
- **New pages added:** `/security`, `/integrations`, `/roadmap`, `/partners`, `/changelog`, `/blog`, `/legal/*`, `/status` (external link).
- **Homelab OS Family strip** added to every page.
- **Pricing expanded** with calculator, FAQ, comparison matrix, MSP tier.
- **Migration pages** added beyond `/vs-pbs` — `/vs-restic-scripts`, `/vs-veeam-ce`, `/from-borg`.
- **Claude Code kickoff prompt** updated for monorepo structure alongside `apps/docs`.

---

## 1. Design direction

### 1.1 Aesthetic

**Industrial reliability meets precision engineering.** Dark, technical, trustworthy. Feels built by someone who takes data loss seriously. The marketing site is a **pre-taste** of the product — if the product's UI is clean, dense, and readable, the marketing site has to match.

This is NOT:
- Corporate SaaS gradient hero backgrounds
- Playful / bubbly (backup software, not a todo app)
- Cluttered feature lists (quality over quantity)

This IS:
- Dark by default — light-mode toggle available, persisted in localStorage
- Inter for prose, IBM Plex Mono for technical values (snapshot IDs, sizes, prices, timings, CLI)
- Amber accent (#F5A623) — distinct per OS Family product
- Visible data: real file sizes, real run times, real prices

### 1.2 Palette — aligned with app UI spec v2

Dark mode tokens (default):

```css
:root.dark {
  /* Surfaces — identical to app */
  --bg:       #0A0A0A;
  --bg2:      #0F0F0F;
  --surf:     #141414;
  --surf2:    #1A1A1A;

  /* Borders */
  --border:   #242424;
  --border2:  #2E2E2E;

  /* Text */
  --fg:       #EDEDED;
  --fg-mute:  #9A9A9A;
  --fg-dim:   #6B6B6B;
  --fg-faint: #444444;

  /* Accent — BackupOS amber */
  --accent:      #F5A623;
  --accent-fg:   #000000;
  --accent-dim:  rgba(245, 166, 35, 0.12);
  --accent-ring: rgba(245, 166, 35, 0.28);
  --accent-deep: #854F0B;

  /* Semantic */
  --ok:   #00C896;  --ok-dim:   rgba(0,200,150,0.12);
  --warn: #F5A623;  --warn-dim: rgba(245,166,35,0.12);
  --err:  #E5484D;  --err-dim:  rgba(229,72,77,0.12);
  --info: #4A9EFF;  --info-dim: rgba(74,158,255,0.12);
}
```

Light mode inverts the surface tokens and keeps semantic hues. The amber accent slightly darkens (#D48B14) on light to maintain contrast.

**Accent/warn collision reminder:** BackupOS accent is the same hex as OS Family warn. Resolve by context — never place a warn status next to an accent CTA in the same visual cluster.

### 1.3 Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Hero headlines | Inter | 600 | 56–72px |
| Section headlines | Inter | 600 | 36–48px |
| Sub-headlines | Inter | 400 | 18–22px |
| Body | Inter | 400 | 15–17px |
| Eyebrows / section labels | IBM Plex Mono | 500 | 11px uppercase, 0.08em tracking |
| Technical values (sizes, IDs, durations, prices) | IBM Plex Mono | 400 | matches surrounding text |
| CLI / code | IBM Plex Mono | 400 | 13px |
| UI labels (buttons, badges) | Inter | 500 | 13–14px |

Never Arial, Roboto, System UI, or generic stacks. Inter and Plex are served locally via `@fontsource/*` packages, not Google CDN — matches product privacy posture.

### 1.4 Logo

Use the same **Grid Shield** mark from the product:
- Primary mark: `/public/logo-primary.svg` (48×48, 4-quadrant amber grid with cream centre)
- Wordmark: `/public/wordmark.svg` ("Backup" in `--fg`, "OS" in `--accent`)
- Favicon: `/public/favicon.svg` + multi-res `.ico` + PWA icons + Apple touch

Refer to app UI spec v2 §5 for SVG sources.

### 1.5 Motion

- Hero dashboard preview: progress bar animates once on first view (0% → 72%), then idles
- Section entry: fade-up 180ms with 60ms stagger on scroll (IntersectionObserver, one-shot)
- Job status dots: 1.5s opacity pulse on `running` state, static on others
- Interactive elements: 150ms ease on hover, border-color shifts only — no scale transforms
- CLI command block: type-on animation on first viewport entry, 12ms per character, one-shot
- Theme toggle: 200ms cross-fade, no layout jump
- Reduced-motion: `prefers-reduced-motion` disables all non-essential animations; progress bar jumps to final state, type-on shows full text

### 1.6 Differentiating details

- Hero preview shows **real** job names from the target persona's homelab (gitbay-dev, stalwart, llm-tools) — signals "built by someone who actually runs this"
- All storage cost figures use **current** real prices with a `last updated 2026-04-16` note (auto-updated monthly via a content source file)
- PBS comparison uses real PBS limitation language from official docs
- CLI examples use realistic token formats (`bos_enroll_xxx`)
- Every pricing figure has a "what counts" tooltip explaining the unit

---

## 2. Site structure

```
backupos.app/
├── /                                Landing page
├── /features                        Full feature index (deep)
├── /cloud                           BackupOS Cloud — managed service landing
│   ├── /cloud/solo                  Solo plan detail
│   ├── /cloud/teams                 Teams plan detail
│   └── /cloud/partners              Partner / MSP tier
├── /pricing                         Pricing + storage cost calculator
├── /vs-pbs                          vs Proxmox PBS (migration)
├── /vs-restic-scripts               vs raw Restic scripts (migration)
├── /vs-veeam-ce                     vs Veeam Community Edition
├── /from-borg                       Borg monitor + migration path
├── /integrations                    Full integrations index
│   ├── /integrations/proxmox
│   ├── /integrations/infra-os
│   ├── /integrations/proxy-os
│   ├── /integrations/authentik
│   └── /integrations/[...]          Per-integration pages
├── /security                        Security overview + disclosure
├── /docs                            Full documentation (see §4)
├── /changelog                       Versioned changelog (from release notes)
├── /roadmap                         Public roadmap
├── /blog                            Launch posts, deep dives
│   └── /blog/[slug]                 Individual posts
├── /os-family                       Homelab OS Family hub link-out
├── /legal/terms
├── /legal/privacy
├── /legal/dpa                       Data processing agreement (Cloud Teams)
├── /legal/subprocessors             Cloud subprocessor list
└── (external) status.backupos.app   Uptime Kuma instance
```

**Homelab OS Family strip** appears in the footer of every page, linking to sibling products: Infra OS, ProxyOS, MxWatch, LockBoxOS, PatchOS, AccessOS, and the hub at homelabos.app.

---

## 3. Landing page

### 3.1 Global navigation

**Sticky, `--bg2` fill, 1px `--border` bottom, 64px tall, z-index 50.**

Grid layout:

```
[Logo 32px] [Wordmark] [v1.0 badge]  │  Features  Docs  Cloud  Pricing  Integrations  │  [GitHub ↗] [☀/☾] [Open app →]
```

- Left: logo mark + wordmark + version badge (Plex Mono 10px, `--surf2` fill, `--border`)
- Centre: nav links, 14px Inter 400, `--fg-mute` default, `--fg` hover, active link gets `--accent` underline (2px, 4px offset)
- Right: GitHub link (icon + text, `--fg-mute`), theme toggle, "Open app" amber outline button

Mobile (<960px):
- Centre nav collapses to hamburger
- Hamburger opens slide-down overlay (not full-screen) with nav items + right-rail controls stacked
- Overlay height = content, `--bg2` fill, `--shadow-lg`

### 3.2 Section 1 — Hero

Max width 1200px, centred. 96px top padding on desktop, 48px mobile.

**Eyebrow** (Plex Mono 11px, `--accent`, tracking 0.12em, flanked by 24px `--accent` hairlines):

```
UNIFIED HOMELAB BACKUP
```

**Headline** (Inter 64px, 600 weight, tracking -0.02em, centered, max-width 900px):

```
One backup platform.
Every host, always verified.
```

"One backup platform." is `--fg`. "Every host," is `--fg-mute`. "always verified." is `--accent`.

**Sub-headline** (Inter 19px, 400, `--fg-mute`, line-height 1.6, max-width 640px):

```
Proxmox VMs, Linux bare metal, Windows with VSS, Docker containers,
databases — all backed by Restic's content-addressed engine.
No chains to corrupt. No mystery failures on restore day.
```

**CTA cluster** (horizontal, 16px gap, centered):

- Primary: `Download BackupOS →` — `--accent` fill, `--accent-fg` text, 44px tall, 16px 600 weight, `--radius-sm`
- Secondary: `Try BackupOS Cloud →` — `--surf2` fill, `--fg`, 1px `--border`
- Tertiary: `View on GitHub ↗` — ghost, `--fg-mute`, hover `--fg`

**Trust strip** below CTAs (Plex Mono 12px, `--fg-dim`, centered, 32px top margin):

```
Self-hosted · MIT · Free forever  │  Cloud from $9/mo  │  1.2k+ stars on GitHub
```

(Star count is dynamic — fetched at build time from GitHub API, cached.)

**Hero dashboard preview** (below trust strip, 64px margin top):

Full-width browser chrome mockup in `--surf` fill with `--border` 1px.
- Window chrome: traffic-light dots (red/amber/green circles, ~13px), URL bar showing `backupos.local:3000/dashboard`, `--surf2` address bar, mono font
- Inside: mini dashboard preview composed of real components from the app UI spec
  - 4 KPI cards in a row: `14 jobs · 8 agents · 28/28 last 24h · 284 GB`
  - 4 recent run rows (alternating `--surf`/`--surf`, with `--border` separator):
    - `gitbay-dev (VM 101)` · Proxmox VM · vzdump → R2 · 2h ago · [success]
    - `gitbay-postgres` · PostgreSQL · pg_dump → R2 · 2h ago · [success]
    - `dev-workstation` · Windows · VSS → R2 · 4h ago · [success]
    - `llm-tools (LXC 200)` · Proxmox LXC · vzdump · now · [running] (pulse)
  - Storage bar: `homelab-r2 · 221 GB · ~$3.32/mo` with amber fill

Preview is a static SVG/HTML rendering — not a live iframe. Use the same component tokens from the app spec so it's visually identical.

### 3.3 Section 2 — The problem

Full-width `--bg2` band, 120px vertical padding.

**Label** (Plex Mono 11px, `--fg-dim`): `// the problem`

**Headline** (Inter 48px, 600): "Your backup software is lying to you."

**Two-column split card** (720px width, centered, 2-col grid, `--surf` fill, `--border` 1px, `--radius`):

Left — green heading "What it says:"
```
✓ Backup completed successfully
✓ All files backed up
✓ No errors detected
```

Right — red heading "What happened:"
```
✗ Duplicity chain broken at step 7
✗ Postgres data copied mid-transaction
✗ Windows VSS not invoked — open files skipped
✗ No restore has ever been tested
```

**Closing paragraph** (Inter 17px, `--fg-mute`, max-width 640px, centered):

```
Most operators find out their backups are broken the moment they need
them. BackupOS is built to prevent that — content-addressed storage
that can't corrupt, application-aware hooks that capture live databases
consistently, and YAML restore specs you can test before disaster.
```

### 3.4 Section 3 — vs Proxmox PBS

`--bg` band. Three-column card layout.

**Label:** `// for proxmox users`
**Headline:** "Everything PBS does, plus everything it doesn't."

Three columns as in v1 — PBS / BackupOS (featured) / Migration path. Featured card uses `--accent` 1.5px border and subtle `--accent-dim` halo. Feature checkmarks use `--ok`, crosses use `--err`.

CTA below: `Read the PBS migration guide →` linking to `/vs-pbs`.

### 3.5 Section 4 — Integration with Infra OS

`--bg2` band. Three horizontal feature cards (see v1 §4 for content — kept intact but restyled to new tokens).

Add a fourth pointer beneath the cards:

```
BackupOS is part of the Homelab OS Family →
```

Clicks open `/os-family`, which is a thin link-out to `homelabos.app`.

### 3.6 Section 5 — Features grid

`--bg` band. Six feature cards in a 2×3 grid (3×2 on tablet, 1×6 on mobile). Each card: `--surf` fill, `--border` 1px, `--radius`, `--space-5` padding, tag + title + body.

Content unchanged from v1 §5. Restyled to new tokens.

Add a seventh, smaller card below the grid (full-width) with:

```
...and 20+ more features.
[See the full feature list →]
```

Links to `/features`.

### 3.7 Section 6 — Storage backends

`--bg2` band. Backend comparison table (not grid — table reads better for price comparison).

Columns: Backend · Storage /GB/mo · Egress /GB · Best for

Rows (prices reflect last-updated date in footnote):

| Backend | Storage | Egress | Best for |
|---|---|---|---|
| Cloudflare R2 | $0.015 | **$0** | Most homelabs — free restores |
| Backblaze B2 | $0.006 | $0.01 | Cheapest storage, cold archives |
| Wasabi | $0.0069 | $0 | Zero egress · 90-day min retention |
| AWS S3 | $0.023 | $0.09 | Most compatible · expensive egress |
| Hetzner Storage Box | $0.0057 | $0 | Best value in EU |
| SFTP / local | $0 | $0 | NAS, another VPS, external drive |

Footnote below: `Prices verified 2026-04-16. BackupOS recalculates live in your dashboard.`

**Recommendation card** (below table, `--surf` fill, `--accent` 1px left border, `--space-6` padding):

```
Not sure which to pick?

Most homelabs: Cloudflare R2. Zero egress means a 300GB
restore costs $0, not $27. At 300GB stored: ~$4.50/mo.

BackupOS will tell you when your usage pattern suggests
a cheaper backend. You don't have to calculate it yourself.
```

CTA: `[Use the storage calculator →]` linking to `/pricing#calculator`.

### 3.8 Section 7 — Hypervisor support

Unchanged from v1 §7. Four-column grid, restyled.

### 3.9 Section 8 — YAML restore specs

`--bg2` band. YAML code block (Plex Mono 13px, `--surf2` fill, `--radius`, syntax highlighting via Shiki with custom OS Family theme — amber keywords on dark).

YAML example unchanged from v1 §8. Callouts below restyled as inline badges.

### 3.10 Section 9 — Pricing teaser

Three cards preview (self-hosted, Cloud Solo, Cloud Teams) with "See full pricing →" link to `/pricing`. Keeps landing page focused, sends serious buyers to dedicated page.

### 3.11 Section 10 — Install

Three install paths in tabs: Linux / Windows / Docker Compose. CLI panels rendered with terminal chrome.

Content unchanged from v1 §10. Add a fourth tab:

**Kubernetes / Helm (V1.1):**
```
helm repo add backupos https://charts.backupos.app
helm install backupos backupos/backupos \
  --set encryptionKey=your-32-char-key
```

Badge `V1.1 — coming soon` in the tab label.

Below tabs, add community/support CTAs:

```
Need a hand? Join the community:
[Discord →]  [GitHub Discussions →]  [r/homelab →]
```

### 3.12 Section 11 — Homelab OS Family strip

New section — `--bg` band, 64px vertical padding.

**Label:** `// homelab os family`
**Headline:** "Part of a family of homelab tools." (Inter 36px, centered)

Below: horizontal strip of 7 product marks (Infra OS, ProxyOS, MxWatch, BackupOS, LockBoxOS, PatchOS, AccessOS), each 56×56, each labelled, each linking to its own site. BackupOS mark has a subtle `--accent-dim` glow to indicate "you are here."

CTA: `Explore Homelab OS →` linking to `homelabos.app`.

### 3.13 Section 12 — Footer

Five-column layout (was four in v1):

**Col 1 — Brand:**
Logo + wordmark, tagline:
```
Unified homelab backup.
Self-hosted. MIT. Free forever.
BackupOS Cloud from $9/mo.
```
`© 2026 BackupOS. MIT licensed.`
Link row: GitHub · Mastodon · RSS

**Col 2 — Product:**
Features · vs PBS · Pricing · Changelog · Roadmap · Status ↗

**Col 3 — Cloud:**
Solo · Teams · Partners · Security · Privacy · DPA · Subprocessors

**Col 4 — Resources:**
Docs · Quickstart · API reference · Integrations · Blog · Storage calculator

**Col 5 — Community:**
Discord · GitHub Discussions · r/homelab · r/selfhosted · Proxmox forum

**Bottom bar:**
```
backupos.app · Part of the Homelab OS Family · Built by operators, for operators.
```

---

## 4. /docs — Full documentation site

### 4.1 Relationship to the app

Docs are **one content package rendered twice**:
- External: `docs.backupos.app` (or `backupos.app/docs`) — static Next.js export, indexed by search engines
- In-app: `/docs` route inside the running product, same MDX content rendered inside the app shell

**Source of truth:** `packages/docs-content/` with `.mdx` files and a `nav.json`. Both sites read from the same package.

See app UI spec v2 Part 8 for the full docs architecture. Summary reproduced here for completeness:

### 4.2 Top-level sections

1. **Introduction** — what BackupOS is, why use it, architecture overview, terminology
2. **Getting started** — install (self-hosted, Cloud), enrol agent, first repo, first backup, first restore
3. **Concepts** — jobs, runs, sources, repositories, snapshots, agents, specs, monitors, verification, health score
4. **How-to guides** — 30 task-focused recipes (back up Postgres, migrate from PBS, etc.)
5. **Reference** — exhaustive config, YAML schemas, CLI, API, environment variables
6. **Operations** — deploy, upgrade, maintain, monitor, troubleshoot, plan capacity, user management
7. **Integrations** — Infra OS, ProxyOS, Authentik, Proxmox, PBS monitoring, Borg, Discord, Slack
8. **Security** — threat model, 2FA, encryption, key escrow, compliance
9. **Release notes** — versioned changelog

### 4.3 Layout

Three-pane:
- Left: docs nav sidebar (240px, `--bg2`) — matches app sidebar styling
- Centre: article content (max-width 760px)
- Right: "On this page" TOC rail (220px) — sticky, tracks scroll

**Above content:**
- Breadcrumb (`Docs / Concepts / Jobs`)
- H1 (Inter 32px 600)
- Frontmatter meta strip: tags, difficulty, time estimate, last updated (Plex Mono 11px, `--fg-dim`)

**Below content:**
- `Was this helpful?` feedback widget (thumbs up / down + optional text)
- `Edit on GitHub ↗` link to raw MDX
- `See also` block from frontmatter
- Prev / Next navigation

### 4.4 Search

Top of every docs page: search input (`⌘K` or `/` to focus, 320px, `--surf` fill, rounded pill, `--accent-ring` on focus).

Opens full-screen overlay on focus:
- Results grouped by section (Introduction, Getting started, Concepts, etc.)
- Each result: title + breadcrumb + matched snippet (bold match terms)
- Keyboard nav: ↑↓ move, ↵ open, Esc close
- Recent searches shown when input empty
- Backed by MiniSearch at V1 (client-side, ~50KB gzipped index), DocSearch/Algolia at V1.1 if scale warrants

### 4.5 Versioning

Version switcher top-right of docs nav, opens dropdown:
- `v1.2 (latest)` ← selected
- `v1.1`
- `v1.0`
- `next (unreleased)`

Each version is a separate build output under `/docs/v1.2/`, `/docs/v1.1/`. Latest also available at `/docs/` (no version prefix) for clean SEO.

Stale-version banner at top of article: `You're reading the docs for v1.1. Latest is v1.2. [Switch →]`

### 4.6 Content contributions

- Public GitHub repo: `github.com/backupos/docs`
- Every article has "Edit on GitHub" link
- PR template enforces frontmatter schema
- Preview deploy per PR via Cloudflare Pages
- Copy style guide enforced in PR check: no marketing fluff, second person, present tense, every how-to ends with "Verify" section (see app spec v2 §8.8)

### 4.7 In-app vs external deltas

Only two differences between in-app and external:

1. **Shell** — in-app uses BackupOS app shell (sidebar, profile popover, etc.); external uses marketing shell (global nav, footer, OS Family strip)
2. **Deep links** — in-app `?` help icons on features open docs in a slide-over drawer (70% viewport) without navigation; external docs are always full-page

Content is byte-identical.

### 4.8 Sample page render (for Claude Code reference)

See app UI spec v2 Part 9 — three sample pages fully written:
- `install-self-hosted.mdx`
- `backup-postgresql-database.mdx`
- `upgrading-backupos.mdx`

Use these as voice and structure templates for all remaining pages.

---

## 5. /cloud — BackupOS Cloud landing

Dedicated marketing page for the managed service. This is where people evaluating paid plans land.

### 5.1 Goals

1. Convert "I want backups without running another service" buyers → Cloud Solo signup
2. Convert "my team needs this" buyers → Cloud Teams trial
3. Capture "my MSP manages this for 20 clients" buyers → Partners contact form

### 5.2 Hero

`--bg` band, 96px top padding.

**Eyebrow:** `BACKUPOS CLOUD · MANAGED BACKUP AS A SERVICE`

**Headline:**
```
We'll run BackupOS.
You run your homelab.
```

**Sub-headline** (Inter 19px, `--fg-mute`, max-width 680px):
```
Self-hosted is free forever. But if you'd rather not run another service,
BackupOS Cloud runs the dashboard for you — securely, always updated,
with your data staying in the storage backend you pick.
```

**CTA cluster:**
- Primary: `Start 14-day free trial →` (amber filled, routes to `/cloud/solo?trial=14d`)
- Secondary: `Compare plans →` (ghost, anchors to pricing table)

**Trust strip** (Plex Mono 12px, `--fg-dim`):
```
Data residency: EU or US  ·  SOC2 Type I (in progress)  ·  GDPR-compliant
Your storage credentials · Your repository passwords · Your backups
```

### 5.3 Section — What "managed" actually means

Three-column info grid:

**Col 1 — We run the dashboard.**
```
BackupOS web app runs in our infrastructure (Hetzner EU or
AWS US, you pick at signup). You log in, configure jobs,
monitor status. No Docker container to babysit.
```

**Col 2 — You own the data.**
```
We never store your actual backups. Repositories live in your
R2, B2, S3, or wherever — with your credentials. Agents connect
to our dashboard, but backup traffic never passes through us.
```
Diagram: `[Your homelab agents] → [BackupOS Cloud dashboard (orchestration only)] → [Your R2/B2/S3 bucket (backup data)]`

**Col 3 — Zero-downtime upgrades.**
```
We upgrade BackupOS continuously. You never coordinate a
maintenance window. Your agents stay compatible — agent
upgrades roll out on your preferred channel (stable / beta).
```

### 5.4 Section — What you still control

Important trust signal:

```
We run the dashboard. You keep control of:

· Storage backends and credentials (we never see them)
· Repository encryption passwords (optional escrow; your TOTP)
· Backup schedules and jobs (you own the config)
· Restore specs (YAML, exportable, portable)
· Leave anytime — export your config and run self-hosted
```

Migration-out CTA: `[Read: moving from Cloud to self-hosted →]` linking to `/docs/operations/cloud-to-self-hosted`.

### 5.5 Section — Plans

Pricing matrix (more detailed than landing teaser):

| Feature | Solo | Teams | Partners |
|---|---|---|---|
| **Price** | $9/mo | $29/mo | $99/mo + $5/seat |
| **Hosted dashboard** | ✓ | ✓ | ✓ |
| **Data residency choice** | US or EU | US or EU | US, EU, or dedicated region |
| **Agents** | 5 | Unlimited | Unlimited across tenants |
| **Users** | 1 | 10 included, $3/extra | Unlimited |
| **RBAC** | — | Basic | Advanced per-tenant |
| **Audit log retention** | 30 days | 1 year | 7 years |
| **Restore verification** | Manual | Scheduled | Scheduled + per-tenant |
| **Email alerts** | ✓ | ✓ | ✓ |
| **Slack / Discord alerts** | — | ✓ | ✓ |
| **Webhook alerts** | — | ✓ | ✓ |
| **API access** | — | ✓ | ✓ |
| **SSO (Authentik / Authelia / generic OIDC)** | — | ✓ | ✓ |
| **Multi-tenant** | — | — | ✓ |
| **White-label dashboard** | — | — | ✓ |
| **Named account manager** | — | — | ✓ |
| **Priority support (24h SLA)** | — | Business hrs | 24/7 |

CTAs per column:
- Solo: `Start free trial` (primary)
- Teams: `Start free trial` (primary)
- Partners: `Contact us` (secondary, opens `/cloud/partners`)

### 5.6 Section — Security for Cloud

Brief trust section (detail lives on `/security`):

```
· TLS 1.3 everywhere
· Agent ↔ dashboard via mutual TLS
· Repository passwords never leave your browser (TOTP-gated escrow optional)
· Data residency enforced at VPC level
· Annual penetration test (reports available under NDA to Teams+)
· SOC2 Type II (in progress, ETA Q4 2026)
```

CTA: `Read the full security overview →` linking to `/security`.

### 5.7 Section — FAQ

Expandable question/answer list:

- **Where does Cloud actually run?** EU: Hetzner Falkenstein (fsn1). US: AWS us-east-1. You pick at signup. Data never crosses regions.
- **What if you go out of business?** Every Cloud instance exports its config nightly to your storage backend. If we shut down, your YAML config survives. You can run self-hosted immediately with no migration.
- **Can I move from Cloud to self-hosted?** Yes, any time, no charges. Export your config from Settings, spin up the self-hosted Docker container, import the config, reconnect agents. ~30 minutes.
- **Do agents need internet access?** Yes — agents connect outbound to the dashboard over WebSocket (port 443). They don't need inbound ports open.
- **Is my backup data encrypted at rest in the storage backend?** Always — Restic encrypts at the chunk level before anything leaves the agent. Your storage provider sees ciphertext only.
- **What happens if I exceed my agent limit?** We email you 30 days before any enforcement. No surprise cut-offs.
- **Can I bring my own storage?** Yes — all plans require you to bring your own R2/B2/S3 bucket. Cloud runs the dashboard; your data stays yours.
- **Can I cancel anytime?** Monthly plans: cancel anytime, prorated to day of cancellation. Annual: 30-day money-back guarantee, then non-refundable but usable until term expires.

### 5.8 Section — Signup CTA

Final block before footer:

```
Start your free 14-day trial.
No credit card required until day 14.
```

Primary button: `Start free trial →`

### 5.9 `/cloud/solo` detail page

Deep-dive on Solo plan:
- Hero re-stated for Solo
- Full feature list with context ("Why 5 agents? Because 5 hosts covers most single-operator homelabs")
- Trial flow walkthrough (3 screens: sign up, connect first agent, run first backup)
- Upgrade path to Teams explained
- Checkout flow start

### 5.10 `/cloud/teams` detail page

Same shape but for Teams:
- RBAC diagram (roles: Owner, Admin, Operator, Viewer)
- SSO setup walkthrough for Authentik and Authelia
- API access example (curl + tRPC)
- Audit log screenshot
- Checkout flow

### 5.11 `/cloud/partners` page

Partner / MSP tier:
- Multi-tenant architecture explained
- White-label dashboard customisation options (logo, colour accent, custom domain)
- Per-tenant isolation guarantees
- Billing: single invoice for partner, chargeback to tenants if wanted
- Case-study placeholder (V1.1 when real case studies exist)
- Contact form: name, company, number of tenants, email, notes — posts to `/api/partners-contact` which emails sales@backupos.app

### 5.12 Signup / checkout flow (`/cloud/signup` + `/cloud/checkout`)

Out of scope for marketing spec — handled by Lemon Squeezy hosted checkout per OS Family build standard. Marketing site just deep-links into the appropriate Lemon Squeezy variant. After checkout, Lemon Squeezy webhook provisions the Cloud instance.

---

## 6. /pricing — Full pricing page

### 6.1 Above the fold

**Headline:**
```
Free to self-host.
Managed from $9/mo.
```

**Sub-headline:**
```
BackupOS self-hosted is MIT licensed and free forever. Unlimited
agents, unlimited jobs, unlimited backup targets. No seat fees.
BackupOS Cloud runs it for you from $9/mo.
```

### 6.2 Plan cards

Four-card grid (was three in v1):

**BackupOS — $0 (self-hosted):** unchanged from v1
**BackupOS Cloud Solo — $9/mo:** unchanged from v1
**BackupOS Cloud Teams — $29/mo:** unchanged from v1
**BackupOS Cloud Partners — from $99/mo:** new card — "Multi-tenant for MSPs", CTA `Contact us →`

Annual toggle above cards: Monthly / Annual (20% off). Updates card prices live.

### 6.3 Full comparison matrix

Below the cards, a detailed matrix table showing every feature across all tiers. Around 40 rows, grouped:

- **Core backup** (sources, schedules, retention, hooks)
- **Restore** (specs, verification, DR mode)
- **Repositories** (backends, escrow, cost analytics)
- **Monitoring & alerts** (channels, rules, grouping)
- **Users & access** (count, RBAC, SSO, API)
- **Audit & compliance** (retention, export, hash chain)
- **Support** (channel, SLA, named contact)

Sticky column headers when scrolling. Row hover highlight.

### 6.4 Storage cost calculator

Interactive widget. `--surf` panel, `--border` 1px, `--radius-lg`.

**Inputs (three sliders):**

| Input | Range | Default |
|---|---|---|
| Total backup data (GB) | 10 – 10,000 | 300 |
| Weekly growth (GB) | 0 – 100 | 5 |
| Monthly restore volume (GB) | 0 – 500 | 10 |

**Below sliders — live-updating output:**

```
Projected costs at 12 months:

Ranked cheapest → most expensive
┌─────────────────────┬──────────┬─────────┬──────────┐
│ Backend              │ Monthly  │ Year 1  │ Notes    │
├─────────────────────┼──────────┼─────────┼──────────┤
│ Hetzner Storage Box │ $1.97    │ $23.64  │ EU only  │
│ Backblaze B2         │ $2.08    │ $24.96  │ + $1.20 egress │
│ Wasabi               │ $2.38    │ $28.56  │ 90d min retention│
│ Cloudflare R2        │ $5.16    │ $61.92  │ Zero egress ← recommended │
│ AWS S3               │ $8.80    │ $105.60 │ Expensive egress │
└─────────────────────┴──────────┴─────────┴──────────┘
```

Recommendation logic: R2 wins if restore volume > 10 GB/mo (egress on B2/S3 kills the savings). B2 or Hetzner wins if restore volume low and user is pure storage. Highlighted row with amber left border.

**Math shown on hover** (Plex Mono 11px tooltip): `300 GB × $0.015/GB + 10 GB egress × $0 = $4.50/mo (R2)`

**Data source** link below calculator: `Prices from public pricing pages, updated 2026-04-16 →` (links to a source-of-truth markdown file in the repo).

### 6.5 Pricing FAQ

Expanded from v1. ~12 questions covering:

- Is the self-hosted version really unlimited? (Yes — MIT.)
- What counts as an agent?
- Can I use Cloud with my own S3 bucket? (Yes — BYOB is the only model.)
- What happens at agent limit?
- How do I cancel?
- Refund policy
- Can I pay by invoice / wire / PO? (Teams+ yes, contact sales.)
- Annual billing discount
- Educational / non-profit pricing (50% off, verify via email domain)
- Open source project pricing (free Cloud Teams, application required)
- Can I get a trial extension? (Yes, email support.)
- Does BackupOS offer a bug bounty? (Yes — see `/security`.)

### 6.6 Final CTA

```
Still deciding?

[Start self-hosted ↗]  [Start free cloud trial →]  [Talk to sales →]
```

---

## 7. Migration pages

### 7.1 /vs-pbs

Unchanged structure from v1 §4 but expanded content. Sections:

1. **Feature matrix** (full, all rows, side-by-side)
2. **Why Restic vs PBS storage format** — content-addressing, no datastore corruption, back up anywhere
3. **6-week migration guide** — detailed phase-by-phase with screenshots
4. **FAQ** — 10 questions on PBS-specific concerns
5. **Migration assistance** — "Migrating a large PBS instance? We offer a 1hr migration consult for Teams customers."

### 7.2 /vs-restic-scripts (new)

For operators currently running homegrown Restic scripts:

1. **The shape of the problem** — scripts diverge, nobody owns the restore path, cron is silent when things fail
2. **What BackupOS adds on top of your existing Restic** — scheduling you can see, retention you can reason about, restore you can test, cost you can track
3. **Import your existing repository** — BackupOS can adopt existing Restic repos read-only, then start managing them. Walkthrough.
4. **Keep your password, add escrow** — optional
5. **FAQ**

### 7.3 /vs-veeam-ce (new)

For Windows-shop operators stuck on Veeam Community Edition limits:

1. **Where Veeam CE hits the wall** — 10-agent cap, no cloud backends, no Linux server coverage
2. **What BackupOS unlocks** — unlimited agents, R2/B2 backends, Linux + Windows unified
3. **Migration guide** — keep Veeam running, add BackupOS alongside, decommission Veeam over a month
4. **Is BackupOS as polished for Windows as Veeam?** — honest answer: not yet for UI polish, but the VSS engine is the same. If you need Veeam's wizard-driven ease, stay. If you need multi-platform and cost control, switch.

### 7.4 /from-borg (new)

For Borg users:

1. **Why move (or not)** — Borg is great; BackupOS adds orchestration, multi-agent, database hooks, and restore specs. If you're happy with Borg, you can also just **monitor** Borg from BackupOS without migrating.
2. **Monitor Borg from BackupOS** — read-only observation of your existing Borg repos, aggregate status, alert on missed backups
3. **Full migration path** — side-by-side during transition, export Borg repo list, recreate jobs in BackupOS, re-seed data to Restic repos

---

## 8. /integrations

Index page linking out to per-integration detail pages. Grid of integration cards, filtered by category (Hypervisor, Proxy, SSO, Alerts, Monitoring, Storage).

Per-integration page template:
- Hero: integration logo + BackupOS logo + tagline
- What the integration does
- Setup walkthrough (inline, not linked-out to docs — marketing-friendly)
- Screenshots
- FAQ
- CTA: `Set it up in your BackupOS instance →` linking to the relevant docs page

V1 integrations with dedicated pages:
- Proxmox
- Infra OS
- ProxyOS
- Authentik
- Authelia
- PBS (monitoring)
- Borg (monitoring)
- Cloudflare R2
- Backblaze B2
- Discord
- Slack
- Uptime Kuma

---

## 9. /security

Dedicated security overview — trust page.

### 9.1 Sections

1. **Threat model** — what BackupOS protects against (accidental loss, corruption, ransomware, cloud provider failure) and what it doesn't (targeted nation-state attack on your homelab)
2. **Defence in depth** — auth (password + TOTP) + encryption (Restic chunk-level) + isolation (mutual TLS agent ↔ server) + audit (hash-chained log)
3. **Encryption details** — what algorithms, what's encrypted where, key management
4. **Key escrow** — how TOTP-gated recovery works, what it protects, what it doesn't
5. **Compliance posture** — GDPR, HIPAA alignment, SOC2 roadmap
6. **Data residency (Cloud)** — EU and US regions, enforced at VPC level
7. **Subprocessors (Cloud)** — live list, updated on change (Lemon Squeezy, Hetzner or AWS, Resend for email, Sentry for errors)
8. **Vulnerability disclosure** — security@backupos.app, PGP key, 90-day disclosure window
9. **Bug bounty** — scoped, non-monetary for V1 (credit in security hall of fame), monetary for V1.1+

### 9.2 Security hall of fame

Published list of researchers who've reported valid issues, with consent.

### 9.3 Transparency reports

Quarterly report (V1.1): incidents, response times, user-requested data deletions honoured.

---

## 10. /changelog

Versioned, reverse-chronological. Same content as `docs/release-notes/` but rendered in marketing shell with more visual polish.

Per-release entry:
- Version + date
- Headline feature with screenshot
- Full changelog (bulleted: Added / Changed / Fixed / Deprecated / Removed / Security)
- Breaking changes callout if any
- Upgrade notes callout if any
- `Read migration guide` link if major
- Social share buttons

RSS feed at `/changelog.xml`. Atom feed at `/changelog.atom`. Webhook subscription for auto-notify.

---

## 11. /roadmap

Public, honest, structured roadmap. Kanban-style board:

- **Shipped** (collapsed by default) — what's in the latest release
- **In progress** — what's on current sprint
- **Next up** — committed for next release
- **Exploring** — under consideration, no commitment
- **Won't do** — explicitly rejected with reasoning

Each card: feature name + short description + linked GitHub issue. Upvote button (GitHub reactions).

Clear caveat: "Roadmap reflects current intent. We'll tell you when it changes." Anti-marketing-roadmap phrasing.

---

## 12. /blog

Blog index + per-post pages.

### 12.1 Index

Cards grid, newest first:
- Post title, publish date, author, reading time, tag
- Hover reveals excerpt

Filter by tag: Launch, Technical, Case study, Benchmark, Security, Product update.

### 12.2 Post template

- Hero: title + author + date + reading time
- Featured image (optional)
- MDX content with same styling as docs
- Author byline with bio at bottom
- `Subscribe` CTA at end — RSS, Atom, or email (ConvertKit integration)
- Related posts (by tag)

### 12.3 Launch posts (V1 content plan)

- **BackupOS v1 launch** — the story, why we built it
- **Benchmarks: BackupOS vs PBS on real workloads**
- **Under the hood: how we wrap Restic without breaking it**
- **From Duplicity to BackupOS — a year of homelab backup pain**
- **The economics of homelab backup: R2 vs B2 vs Hetzner at 1TB**
- **Scheduled restore tests: the feature every backup tool should have**
- **Deep dive: how the shared ios-agent works**

---

## 13. /os-family

Thin hub page — mostly a link-out to homelabos.app, but with a product grid for SEO and internal navigation:

- Infra OS
- ProxyOS
- MxWatch
- BackupOS (you are here — amber glow)
- LockBoxOS
- PatchOS
- AccessOS

Each card: logo + name + one-line description + link to own site.

Footer: `Built as one family. Works as one stack. [homelabos.app →]`

---

## 14. /legal/*

Standard legal pages generated from templates:

- **terms.mdx** — terms of service (Cloud)
- **privacy.mdx** — privacy policy
- **dpa.mdx** — data processing agreement (Cloud Teams+, GDPR)
- **subprocessors.mdx** — live list, versioned

All legal pages have last-updated date prominent at top. Old versions archived at `/legal/terms/v1`, etc.

---

## 15. SEO & metadata

Per-page metadata in Next.js `generateMetadata`:

**Home:**
- `title`: BackupOS — Unified Homelab Backup
- `description`: Back up Proxmox VMs, Linux bare metal, Windows with VSS, Docker containers, and databases from one dashboard. Built on Restic. Free to self-host. No chains, no corruption, no mystery failures.
- `og:image`: `/og/home.png` (generated via `@vercel/og` from a template: BackupOS mark + tagline + dashboard preview, 1200×630)

**/vs-pbs:**
- `title`: BackupOS vs Proxmox PBS — Migration Guide
- `description`: Everything PBS does, plus Linux, Windows, Docker, and databases. Migrate from PBS job by job. No big-bang cutover.

**/pricing:**
- `title`: BackupOS Pricing — Free self-hosted, $9/mo Cloud
- `description`: Self-host BackupOS free forever with unlimited agents. BackupOS Cloud Solo from $9/mo, Teams from $29/mo. No seat fees. Bring your own storage.

**/cloud:**
- `title`: BackupOS Cloud — Managed Homelab Backup
- `description`: We run the BackupOS dashboard. You run your homelab. Your storage, your credentials, your backups — from $9/mo.

**/docs/[slug]:**
- `title`: `{article.title} — BackupOS Docs`
- `description`: from frontmatter `description`
- `og:image`: dynamic — `/og/docs?title={title}&section={section}`

**Sitemap:** auto-generated at `/sitemap.xml`. Versioned docs excluded from sitemap except latest.

**Robots:** `/robots.txt` allows all except `/api/*` and `/cloud/signup/*`.

**Structured data:**
- Home: `SoftwareApplication` schema
- Docs articles: `TechArticle` schema
- Blog posts: `BlogPosting` schema
- FAQ sections: `FAQPage` schema
- Pricing: `Product` + `Offer` schema

---

## 16. Tech stack

**Framework:** Next.js 15 (App Router) with static export (`output: 'export'`).
**Hosting:** Cloudflare Pages.
**Styling:** Tailwind CSS v4 with custom OS Family token layer in `tailwind.config.ts`.
**Fonts:** `@fontsource/inter` + `@fontsource/ibm-plex-mono` (self-hosted, no Google CDN).
**Content:** MDX via `@next/mdx` for docs + blog.
**Syntax highlighting:** Shiki with custom `backupos-dark` theme (amber keywords on `--surf2`).
**Search:** MiniSearch at V1, DocSearch/Algolia at V1.1.
**Analytics:** Plausible (self-hosted on Hetzner, privacy-first, no cookies). Opt-in banner only if GDPR requires.
**Forms:** `/api/partners-contact` and `/api/feedback` as Cloudflare Pages Functions, sending via Resend.
**Image optimisation:** `next/image` static export mode + sharp for build-time processing.
**OG image generation:** `@vercel/og` edge function at `/api/og` — works on Cloudflare Pages Functions.

**Monorepo layout:**
```
backupos-web/
├── apps/
│   ├── marketing/          Next.js static (backupos.app)
│   └── docs/               Next.js static (docs.backupos.app OR backupos.app/docs)
├── packages/
│   ├── docs-content/       MDX + nav.json, shared between apps/docs and the product app
│   ├── ui/                 Shared components (Logo, Button, DashboardPreview, CLIPanel, etc.)
│   ├── tokens/             OS Family design tokens
│   └── pricing-data/       Single-source pricing facts (calculator, tables, all copy)
└── tooling/
    └── scripts/            sitemap, og image gen, prices-updated-at check
```

`pnpm` workspaces. Turbo for build orchestration.

---

## 17. Cloudflare Pages deployment

```
# Build command
pnpm build

# Output directory (Next.js static export)
out/

# Environment variables
RESEND_API_KEY        for contact forms
PLAUSIBLE_DOMAIN      analytics
GITHUB_TOKEN          star-count fetch at build time

# Custom headers (_headers in /public)
/install.sh
  Content-Type: text/x-shellscript
  Content-Disposition: inline

/install.ps1
  Content-Type: text/plain
  Content-Disposition: inline

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

# Redirects (_redirects in /public)
/discord       https://discord.gg/backupos        302
/github        https://github.com/backupos/...    302
/status        https://status.backupos.app        302
```

Install scripts are static files in `/public/` with placeholder tokens (`__BACKUPOS_URL__`, `__ENROLLMENT_TOKEN__`) that the running BackupOS server fills in when generating actual enrolment commands. The marketing site shows the pattern; real tokens come from the instance.

**Build guardrails:**
- `scripts/check-prices-fresh.ts` fails the build if `pricing-data/backends.ts` hasn't been updated in 60+ days
- `scripts/check-dead-links.ts` crawls built output and fails on 404s
- `scripts/check-docs-frontmatter.ts` enforces frontmatter schema
- PR preview deploys via Cloudflare Pages GitHub integration

---

## 18. Claude Code kickoff prompt

```
Build the BackupOS marketing website monorepo at backupos.app.

Read backupos-website-spec-v2.md completely before writing any code. Also
read backupos-ui-spec-v2.md for design tokens, logo assets, and docs structure
— the marketing site and the product app must share a design language.

Tech stack:
- Next.js 15 (App Router) with output: 'export' for Cloudflare Pages
- Tailwind CSS v4 with custom OS Family token layer
- MDX via @next/mdx for /docs and /blog
- Shiki for code syntax with a custom "backupos-dark" theme (amber keywords)
- MiniSearch for docs search
- Resend for /api/partners-contact (Cloudflare Pages Functions)
- @vercel/og for dynamic OG images
- pnpm workspaces + Turbo

Monorepo structure:
  apps/marketing           backupos.app
  apps/docs                backupos.app/docs (alt: docs.backupos.app)
  packages/docs-content    MDX source of truth — shared with product app
  packages/ui              Logo, Button, DashboardPreview, CLIPanel, YAMLPanel, ComparisonCard, PricingCard, BackendTable, Calculator, InstallTabs, Footer
  packages/tokens          OS Family design tokens
  packages/pricing-data    Backends, plans, features — single source

Theme: dark default, light toggle persisted in localStorage.
Tokens: amber accent #F5A623, surfaces #0A0A0A/#0F0F0F/#141414/#1A1A1A,
  Inter for prose, IBM Plex Mono for technical values.
  Self-host fonts via @fontsource packages — do NOT use Google Fonts CDN.

Build components first (in packages/ui):
- Logo (primary, wordmark, favicon — SVG from backupos-ui-spec-v2.md §5)
- NavBar (sticky, dark, with version badge, theme toggle, Open app button)
- Hero with DashboardPreview mockup
- CLIPanel (terminal chrome, syntax-coloured output, type-on animation respecting prefers-reduced-motion)
- YAMLPanel (Shiki-rendered)
- ComparisonCard (PBS / BackupOS / Migration path — 3-col)
- FeatureCard (tag + title + body)
- BackendTable (storage backends with live cost calculation)
- PricingCard (with annual toggle binding)
- PricingMatrix (40-row sticky-header comparison table)
- StorageCostCalculator (3 sliders + live ranked output table)
- InstallTabs (Linux / Windows / Docker Compose / Kubernetes)
- OSFamilyStrip (7 product marks, BackupOS highlighted)
- Footer (5-col)

Build pages in this order:
1. apps/marketing/app/page.tsx — Landing (12 sections per §3)
2. apps/marketing/app/pricing/page.tsx — incl. calculator per §6.4
3. apps/marketing/app/cloud/page.tsx + /solo + /teams + /partners per §5
4. apps/marketing/app/vs-pbs/page.tsx per §7.1
5. apps/marketing/app/security/page.tsx per §9
6. apps/marketing/app/integrations/page.tsx + [slug] template per §8
7. apps/marketing/app/changelog/page.tsx per §10
8. apps/marketing/app/roadmap/page.tsx per §11
9. apps/marketing/app/blog per §12
10. apps/marketing/app/os-family/page.tsx per §13
11. apps/marketing/app/legal/{terms,privacy,dpa,subprocessors}/page.tsx per §14
12. apps/marketing/app/vs-restic-scripts, /vs-veeam-ce, /from-borg per §7
13. apps/docs — full three-pane docs site per §4, reading from packages/docs-content

Copy source:
- Use exact copy from the spec. Do NOT invent marketing language.
- Use real data from personas: gitbay-dev, stalwart, llm-tools, homelab-r2.
- Prices: read from packages/pricing-data/backends.ts.

Build guardrails (fail build if violated):
- scripts/check-prices-fresh.ts — backends.ts updated in last 60 days
- scripts/check-dead-links.ts — no 404s in built output
- scripts/check-docs-frontmatter.ts — frontmatter schema valid
- Lighthouse CI — performance > 95, accessibility > 95 on every PR

SEO per §15. Cloudflare Pages deployment per §17.

Before writing any code, summarise the plan and ask for confirmation on:
- Monorepo structure
- Whether docs live at /docs or docs.backupos.app
- Colour token mapping (confirm amber accent matches app)

Ask before deviating from the spec. Do not add features or sections not in the spec.
```

---

## 19. Migration from v1 spec

If you've already started building from v1:

**Must-fix (breaking visual divergence):**
1. Replace blue accent with amber everywhere
2. Replace JetBrains Mono → IBM Plex Mono
3. Replace Outfit → Inter
4. Update surface tokens (`#0B0E14` → `#0A0A0A`, etc.)
5. Logo is Grid Shield, not 2×2 opacity-fade grid

**Can-defer (additive):**
- New pages (`/cloud/*`, `/security`, `/integrations`, `/roadmap`, `/blog`, `/os-family`, `/legal/*`)
- Calculator math expansion
- OG image generation
- Build guardrails

**Content stays:**
- All landing page copy from v1 is preserved verbatim
- PBS comparison matrix unchanged
- YAML restore spec example unchanged
- Feature grid copy unchanged
- Install commands unchanged (tokens still `bos_enroll_xxx`)

---

## 20. Launch checklist

Before flipping DNS on backupos.app:

- [ ] All pages render without console errors
- [ ] Lighthouse: perf ≥ 95, a11y ≥ 95, SEO ≥ 95, PWA ≥ 80 on every page
- [ ] OG images render for every route
- [ ] Sitemap generated and submitted to Google Search Console
- [ ] RSS feeds valid (validator.w3.org)
- [ ] Install scripts tested: `curl backupos.app/install.sh | bash` works end-to-end
- [ ] Calculator math verified against published backend prices
- [ ] Every outbound link checked (especially OS Family siblings — 404s make the family look broken)
- [ ] Legal pages reviewed by legal (actual legal, not AI-drafted)
- [ ] Docs v1.0 content at least covers the Getting Started path
- [ ] Status page live at status.backupos.app and linked in footer
- [ ] GitHub repo public with README pointing to backupos.app
- [ ] Discord server live and linked
- [ ] Monitoring: Uptime Kuma checks on homepage, /docs, /pricing, /cloud — alerting to Discord
- [ ] Cloud signup flow end-to-end tested with a real Lemon Squeezy transaction (refund immediately)
- [ ] Partners contact form tested — email arrives, no spam
- [ ] DMARC/SPF/DKIM configured for backupos.app (use MxWatch to verify — dogfood)
- [ ] GA event: launch post published on /blog + Hacker News + r/homelab + r/selfhosted
