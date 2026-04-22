# BackupOS UI Redesign

**Date:** 2026-04-22  
**Status:** Approved  
**Reference:** borg-ui (https://github.com/karanhudia/borg-ui), approved mockup in `.superpowers/brainstorm/`

---

## Overview

Full component rebuild of the BackupOS web app UI. Replace all inline-style components with a proper CSS class system, new shared component library, and borg-ui-inspired card grid layouts. The result is a professional light-theme dashboard that feels more premium than the current dark inline-style approach.

**Decisions made:**
- Theme: Light (white sidebar, `#f9fafb` canvas)
- Accent: Amber (retained from existing brand identity)
- Layout: Card grid — stat cards up top, content cards below
- Sidebar: Full-width labeled sidebar (228px), grouped nav, amber active state
- Approach: Option 2 — full component rebuild (not CSS variable swap, not incremental)

---

## Design Tokens

Replace existing CSS variables in `apps/web/app/globals.css` with a light-theme token set:

```css
:root {
  /* Backgrounds */
  --bg:        #f9fafb;   /* canvas / main content area */
  --bg2:       #ffffff;   /* sidebar, cards, topbar */
  --bg3:       #f3f4f6;   /* table headers, hover states */

  /* Borders */
  --border:    #e5e7eb;
  --border-2:  #f3f4f6;   /* subtle inner borders */

  /* Foreground */
  --fg:        #111827;
  --fg-mute:   #374151;
  --fg-dim:    #6b7280;
  --fg-faint:  #9ca3af;

  /* Amber accent (brand) */
  --accent:     #f59e0b;
  --accent-dark: #d97706;
  --accent-dim:  #fef3c7;
  --accent-text: #92400e;

  /* Status */
  --success:    #16a34a;
  --success-bg: #dcfce7;
  --warning:    #d97706;
  --warning-bg: #fef3c7;
  --danger:     #dc2626;
  --danger-bg:  #fee2e2;
  --info:       #2563eb;
  --info-bg:    #dbeafe;

  /* Radius */
  --radius:    8px;
  --radius-sm: 6px;
  --radius-lg: 10px;

  /* Shadow */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
  --shadow:    0 1px 6px rgba(0,0,0,0.08);
}
```

---

## CSS Class System

Create `apps/web/app/design.css` (imported in `globals.css`). This file provides all reusable utility classes so components stop using inline styles.

### Layout
```css
.page          /* padding: 20px, flex column, gap 16px */
.page-header   /* flex row, align-items center, justify space-between, margin-bottom 16px */
.page-title    /* font-size 18px, font-weight 700, color var(--fg) */
```

### Cards
```css
.card          /* bg2, border, border-radius lg, shadow-sm */
.card-header   /* flex, justify space-between, align center, padding 12px 16px, border-bottom border-2 */
.card-title    /* font-size 11px, font-weight 600, color fg-dim, text-transform uppercase, letter-spacing 0.05em */
.card-body     /* padding 12px 16px */
.card-footer   /* padding 10px 16px, border-top border-2, bg3 */
```

### Grids
```css
.stat-grid     /* display grid, grid-template-columns repeat(4,1fr), gap 12px, margin-bottom 16px */
.card-grid     /* display grid, grid-template-columns 1.6fr 1fr, gap 12px */
.card-grid--equal  /* grid-template-columns 1fr 1fr */
```

### Stat Cards
```css
.stat-card     /* card + padding 14px 16px */
.stat-label    /* font-size 11px, font-weight 500, fg-faint, uppercase, letter-spacing 0.05em, margin-bottom 6px */
.stat-value    /* font-size 26px, font-weight 800, fg, letter-spacing -0.02em, line-height 1 */
.stat-sub      /* font-size 11px */
.stat-sub--up       /* color success */
.stat-sub--warn     /* color warning */
.stat-sub--muted    /* color fg-faint */
```

### Badges
```css
.badge              /* inline-flex, align-items center, gap 4px, font-size 11px, font-weight 500, padding 2px 8px, border-radius 20px */
.badge--success     /* bg success-bg, color success */
.badge--warning     /* bg warning-bg, color warning */
.badge--danger      /* bg danger-bg, color danger */
.badge--info        /* bg info-bg, color info */
.badge--neutral     /* bg bg3, color fg-dim */
```

### Tables
```css
.table-wrap    /* border, border-radius lg, overflow hidden, bg bg2, shadow-sm */
.table         /* width 100%, border-collapse collapse */
.table th      /* bg bg3, padding 8px 14px, font-size 11px, font-weight 600, fg-faint, text-transform uppercase, letter-spacing 0.05em, text-align left */
.table td      /* padding 10px 14px, font-size 13px, fg-mute, border-top border-2 */
.table tr:hover td  /* bg bg3 */
```

### Buttons
```css
.btn           /* inline-flex, align-items center, gap 6px, border-radius radius-sm, font-size 13px, font-weight 600, cursor pointer, border none, transition 0.1s */
.btn--primary  /* bg accent, color white */
.btn--primary:hover  /* bg accent-dark */
.btn--ghost    /* bg transparent, color fg-dim, border border */
.btn--ghost:hover    /* bg bg3 */
.btn--danger   /* bg danger-bg, color danger */
.btn--sm       /* padding 5px 10px, font-size 12px */
.btn--md       /* padding 7px 14px */
.btn--lg       /* padding 9px 18px, font-size 14px */
```

### Forms
```css
.input         /* bg bg2, border, border-radius radius-sm, padding 7px 10px, font-size 13px, color fg, outline none */
.input:focus   /* border-color accent, box-shadow 0 0 0 2px accent-dim */
.label         /* font-size 12px, font-weight 500, fg-mute, margin-bottom 4px */
.field         /* flex column, gap 4px */
```

---

## Component Architecture

All components live in `apps/web/components/ui/`. Each is a focused, single-purpose file.

### New shared components

| File | Purpose |
|------|---------|
| `ui/card.tsx` | `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` |
| `ui/stat-card.tsx` | `<StatCard label value sub trend?>` |
| `ui/badge.tsx` | `<Badge variant="success|warning|danger|info|neutral">` |
| `ui/button.tsx` | `<Button variant size>` |
| `ui/table.tsx` | `<Table>`, `<Thead>`, `<Tbody>`, `<Th>`, `<Td>`, `<Tr>` |
| `ui/page-header.tsx` | `<PageHeader title action?>` — consistent page top bar |
| `ui/empty-state.tsx` | `<EmptyState icon title description action?>` |

### Rebuilt layout components

| File | Changes |
|------|---------|
| `components/sidebar.tsx` | Light theme, `var(--bg2)` background, `var(--accent-dim)` active bg, `var(--accent-dark)` active text, amber left-border indicator on active item, user avatar with initials fallback |
| `components/topbar.tsx` | White bg, search pill (⌘K), notification bell with red dot, primary CTA button |

---

## Layout Shell

`apps/web/app/(dashboard)/layout.tsx` — no structural changes, only CSS variable usage cleaned up. The `display:flex; height:100vh` shell stays identical.

---

## Page Redesigns

### Dashboard (`/dashboard`)

Four-column `stat-grid` (Repositories, Snapshots, Storage, Health score), then a two-column `card-grid` (Recent Jobs card left, Upcoming Schedules + Alerts stacked right). Mirrors the approved mockup exactly.

### List pages (Jobs, Schedules, Snapshots, Repositories, Monitors, Agents, Alerts, Audit)

Each follows the same pattern:
1. `<PageHeader title="Jobs" action={<Button variant="primary">+ New job</Button>} />`
2. Optional `stat-grid` with 2–3 context-specific stats
3. `<Table>` with appropriate columns, status `<Badge>` in the status column, row hover state
4. Empty state via `<EmptyState>` when no records

### Detail pages (`/repositories/[id]`, `/monitors/[id]`, etc.)

Two-column layout: left side is the primary card (details, config), right side is a secondary card (recent runs, health timeline, or actions). Uses `card-grid` with a `2fr 1fr` split.

### Auth pages (`/login`, `/signup`)

Centred card on `--bg` canvas. Logo at top of card, form below, amber primary button. No sidebar.

---

## Files to Create

```
apps/web/app/design.css
apps/web/components/ui/card.tsx
apps/web/components/ui/stat-card.tsx
apps/web/components/ui/badge.tsx
apps/web/components/ui/button.tsx
apps/web/components/ui/table.tsx
apps/web/components/ui/page-header.tsx
apps/web/components/ui/empty-state.tsx
```

## Files to Modify

```
apps/web/app/globals.css          ← replace CSS variables, import design.css
apps/web/components/sidebar.tsx   ← light theme rebuild
apps/web/components/topbar.tsx    ← light theme rebuild
apps/web/app/(dashboard)/dashboard/page.tsx  ← stat-grid + card-grid
apps/web/app/(dashboard)/jobs/page.tsx
apps/web/app/(dashboard)/schedules/page.tsx
apps/web/app/(dashboard)/repositories/page.tsx
apps/web/app/(dashboard)/monitors/page.tsx
apps/web/app/(dashboard)/agents/page.tsx
apps/web/app/(dashboard)/snapshots/page.tsx
apps/web/app/(dashboard)/alerts/page.tsx
apps/web/app/(dashboard)/audit/page.tsx
apps/web/app/(dashboard)/activity/page.tsx
apps/web/app/(dashboard)/logs/page.tsx
apps/web/app/(auth)/login/page.tsx
apps/web/app/(auth)/signup/page.tsx
```

Detail pages (`/[id]` routes) follow in a second pass once the pattern is proven on list pages.

---

## What Does NOT Change

- All data fetching logic, tRPC calls, server actions — untouched
- Navigation structure (groups, hrefs, labels) — identical
- DR mode overlay, command palette, favicon manager — untouched
- `packages/db`, `packages/docs-content` — no changes

---

## Success Criteria

- Every page uses CSS classes from `design.css`, zero inline `style={{}}` on layout/color/spacing
- Sidebar and topbar pass visual inspection against the approved mockup
- Dashboard renders stat-grid + card-grid with real data
- All list pages use `<Table>` + `<Badge>` pattern
- No TypeScript errors, build passes
