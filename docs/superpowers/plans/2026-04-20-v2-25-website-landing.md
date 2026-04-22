# BackupOS Marketing Website — Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the BackupOS marketing website as a standalone Next.js 15 static-export app at `apps/web-site/` with a complete landing page.

**Architecture:** Separate Next.js app inside the pnpm monorepo — `output: 'export'` so it deploys as pure static HTML/CSS/JS. No shared packages needed for the landing page. CSS custom properties design system matching the dashboard's amber accent (#F5A623) on dark surfaces.

**Tech Stack:** Next.js 15, TypeScript, `@fontsource/inter`, `@fontsource/ibm-plex-mono`, CSS custom properties, pnpm workspace.

---

## File Map

| File | Responsibility |
|------|----------------|
| `apps/web-site/package.json` | App manifest, deps |
| `apps/web-site/tsconfig.json` | TypeScript config |
| `apps/web-site/next.config.ts` | Static export config |
| `apps/web-site/app/globals.css` | CSS variables, reset, fonts |
| `apps/web-site/app/layout.tsx` | Root layout, metadata |
| `apps/web-site/app/components/nav.tsx` | Sticky nav bar |
| `apps/web-site/app/components/hero.tsx` | Hero section |
| `apps/web-site/app/components/problem.tsx` | Problem statement section |
| `apps/web-site/app/components/vs-pbs.tsx` | BackupOS vs plain Restic comparison table |
| `apps/web-site/app/components/features-grid.tsx` | Feature cards grid |
| `apps/web-site/app/components/backends.tsx` | Supported backends logos/list |
| `apps/web-site/app/components/install.tsx` | Install snippet tabs |
| `apps/web-site/app/components/os-family.tsx` | OS compatibility strip |
| `apps/web-site/app/components/footer.tsx` | 5-column footer |
| `apps/web-site/app/page.tsx` | Root page — wires all sections |
| `apps/web-site/public/logo.svg` | SVG logo mark |

---

### Task 1: Scaffold the app

**Files:**
- Create: `apps/web-site/package.json`
- Create: `apps/web-site/tsconfig.json`
- Create: `apps/web-site/next.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@backupos/web-site",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@fontsource/inter": "^5.1.1",
    "@fontsource/ibm-plex-mono": "^5.1.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default config
```

- [ ] **Step 4: Install deps**

Run from repo root:
```bash
cd /Users/dariusvorster/Projects/backupos && pnpm install
```
Expected: no errors, `apps/web-site/node_modules` populated.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/package.json apps/web-site/tsconfig.json apps/web-site/next.config.ts
git commit -m "feat(web-site): scaffold Next.js static-export marketing app"
```

---

### Task 2: Design system — globals.css and layout

**Files:**
- Create: `apps/web-site/app/globals.css`
- Create: `apps/web-site/app/layout.tsx`
- Create: `apps/web-site/public/logo.svg`

- [ ] **Step 1: Create globals.css**

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/ibm-plex-mono/400.css';

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0A0A0A;
  --surf:     #141414;
  --surf2:    #1A1A1A;
  --border:   rgba(255,255,255,0.08);
  --border2:  rgba(255,255,255,0.04);
  --fg:       #F2F2F2;
  --fg-dim:   #8A8A8A;
  --fg-mute:  #555;
  --accent:   #F5A623;
  --accent-h: #FFB84D;
  --ok:       #3DD68C;
  --err:      #F56565;
  --warn:     #F5A623;
  --radius:   10px;
  --radius-sm: 6px;
  --font-mono: 'IBM Plex Mono', monospace;
  --max-w:    1180px;
}

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }

.container {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 24px;
}

@media (max-width: 768px) {
  .container { padding: 0 16px; }
}
```

- [ ] **Step 2: Create layout.tsx**

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BackupOS — Restic backup management',
  description: 'Automated, encrypted, deduplicated backups powered by Restic. One dashboard for all your repositories.',
  openGraph: {
    title: 'BackupOS',
    description: 'Automated Restic backup management',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Create public/logo.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="#F5A623"/>
  <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="#0A0A0A" opacity=".9"/>
  <circle cx="18" cy="16" r="3" fill="#F5A623"/>
</svg>
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/globals.css apps/web-site/app/layout.tsx apps/web-site/public/logo.svg
git commit -m "feat(web-site): design system — globals.css, layout, logo"
```

---

### Task 3: Nav component

**Files:**
- Create: `apps/web-site/app/components/nav.tsx`

- [ ] **Step 1: Create nav.tsx**

```typescript
'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'

const links = [
  { label: 'Features',    href: '#features'  },
  { label: 'Backends',    href: '#backends'   },
  { label: 'Install',     href: '#install'    },
  { label: 'Pricing',     href: '/pricing/'   },
  { label: 'Docs',        href: '/docs/'      },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      transition: 'all 0.2s',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', height: 60, gap: 32 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 16 }}>
          <Image src="/logo.svg" alt="BackupOS" width={28} height={28} />
          BackupOS
        </a>

        <nav style={{ display: 'flex', gap: 28, marginLeft: 8, flex: 1 }} aria-label="Main">
          {links.map(l => (
            <a key={l.label} href={l.href} style={{
              fontSize: 14, color: 'var(--fg-dim)',
              transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-dim)')}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="https://github.com/backupos/backupos" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
            GitHub
          </a>
          <a href="/app/" style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#000',
          }}>
            Get started
          </a>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/nav.tsx
git commit -m "feat(web-site): sticky nav component"
```

---

### Task 4: Hero section

**Files:**
- Create: `apps/web-site/app/components/hero.tsx`

- [ ] **Step 1: Create hero.tsx**

```typescript
const termLines = [
  { t: 'dim',    v: '$ restic snapshots' },
  { t: 'ok',     v: 'ID        Date       Host    Tags' },
  { t: 'normal', v: 'a1b2c3d4  2026-04-20  srv-01  daily' },
  { t: 'normal', v: 'e5f6g7h8  2026-04-19  srv-01  daily' },
  { t: 'accent', v: '✓  2 snapshots, 3.2 GB stored (saved 68%)' },
]

const colors: Record<string, string> = {
  dim:    'var(--fg-mute)',
  ok:     'var(--ok)',
  normal: 'var(--fg)',
  accent: 'var(--accent)',
}

export function Hero() {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center' }}>
      <div className="container">
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)',
          fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 24,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Open source · Self-hosted
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Restic backups,<br />
          <span style={{ color: 'var(--accent)' }}>without the ops burden</span>
        </h1>

        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--fg-dim)', maxWidth: 540, margin: '0 auto 36px', lineHeight: 1.65 }}>
          BackupOS wraps Restic with a web UI, job scheduler, email alerts, and repository health checks — so your backups actually run.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
          <a href="#install" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 600,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#000',
          }}>
            Install in 60 seconds
          </a>
          <a href="https://github.com/backupos/backupos" target="_blank" rel="noopener noreferrer" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            color: 'var(--fg)',
          }}>
            View on GitHub
          </a>
        </div>

        <div style={{
          maxWidth: 640, margin: '0 auto',
          background: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
          textAlign: 'left',
        }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {['#F56565','#F5A623','#3DD68C'].map(c => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
            ))}
          </div>
          <div style={{ padding: 20, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8 }}>
            {termLines.map((line, i) => (
              <div key={i} style={{ color: colors[line.t] }}>{line.v}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/hero.tsx
git commit -m "feat(web-site): hero section"
```

---

### Task 5: Problem + vs-plain-restic sections

**Files:**
- Create: `apps/web-site/app/components/problem.tsx`
- Create: `apps/web-site/app/components/vs-pbs.tsx`

- [ ] **Step 1: Create problem.tsx**

```typescript
const pains = [
  { icon: '🔕', title: 'Silent failures',    body: 'Cron jobs fail, no one notices. Data is gone when you need it most.' },
  { icon: '🗂', title: 'Repo sprawl',         body: 'Dozens of Restic repos across machines with no central view of health or size.' },
  { icon: '⏱', title: 'Manual scheduling',   body: 'Writing cron syntax and prune policies by hand for every new repo.' },
  { icon: '🔑', title: 'Key management',      body: 'Repository passwords stored in plaintext scripts or forgotten entirely.' },
]

export function Problem() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Restic is great. <span style={{ color: 'var(--fg-dim)' }}>Managing it isn't.</span>
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52, fontSize: 16 }}>
          Four problems that bite every self-hoster eventually.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {pains.map(p => (
            <div key={p.title} style={{
              background: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 28,
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{p.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{p.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create vs-pbs.tsx**

```typescript
const rows: { label: string; plain: string; bos: string }[] = [
  { label: 'Backup scheduling',  plain: 'Manual cron',         bos: 'UI scheduler + CRON builder'    },
  { label: 'Failure alerts',     plain: 'None',                bos: 'Email + webhook notifications'  },
  { label: 'Repo health checks', plain: 'Manual restic check', bos: 'Automated check jobs'            },
  { label: 'Password storage',   plain: 'Plaintext / env var', bos: 'AES-256-GCM escrow'             },
  { label: 'Prune policies',     plain: 'Per-repo shell flags', bos: 'Policy UI, applied per job'    },
  { label: 'Dashboard',          plain: 'None',                bos: 'Multi-repo stats + dedup bar'   },
  { label: 'DR runbooks',        plain: 'DIY docs',            bos: 'Built-in restore wizards'       },
]

export function VsPbs() {
  const th: React.CSSProperties = {
    padding: '10px 20px', fontSize: 12, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--fg-dim)', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = { padding: '13px 20px', fontSize: 14 }

  return (
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>
          BackupOS vs bare Restic
        </h2>
        <div style={{
          background: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Feature</th>
                <th style={th}>Bare Restic</th>
                <th style={{ ...th, color: 'var(--accent)' }}>BackupOS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border2)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{r.label}</td>
                  <td style={{ ...td, color: 'var(--fg-mute)' }}>{r.plain}</td>
                  <td style={{ ...td, color: 'var(--ok)' }}>✓ {r.bos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/problem.tsx apps/web-site/app/components/vs-pbs.tsx
git commit -m "feat(web-site): problem + vs-plain-restic sections"
```

---

### Task 6: Features grid + Backends section

**Files:**
- Create: `apps/web-site/app/components/features-grid.tsx`
- Create: `apps/web-site/app/components/backends.tsx`

- [ ] **Step 1: Create features-grid.tsx**

```typescript
const features = [
  { icon: '🗓', title: 'Job scheduler',        body: 'CRON expressions with UI preview. Run on-demand or on schedule.' },
  { icon: '📬', title: 'Email alerts',          body: 'Configurable SMTP. Get notified on failure, success, or both.' },
  { icon: '🔍', title: 'Health checks',         body: 'Automated `restic check` jobs with pass/fail history.' },
  { icon: '🔐', title: 'Password escrow',       body: 'AES-256-GCM encrypted key storage with passphrase recovery.' },
  { icon: '✂️', title: 'Prune policies',        body: 'Keep N daily / weekly / monthly snapshots, applied per job.' },
  { icon: '📊', title: 'Dedup stats',           body: 'Per-repo size, raw size, and deduplication ratio at a glance.' },
  { icon: '🔄', title: 'Restore wizards',       body: 'Guided file, database, and full-host restore with DR runbooks.' },
  { icon: '📋', title: 'Audit log',             body: 'Immutable log of every backup run, check, and configuration change.' },
]

export function FeaturesGrid() {
  return (
    <section id="features" style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Everything Restic needs to be production-ready
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Built for self-hosters who treat their data seriously.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '24px 24px 20px',
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create backends.tsx**

```typescript
const backends = [
  { name: 'Local filesystem', note: 'path:/backup'     },
  { name: 'SFTP / SSH',       note: 'sftp:user@host'   },
  { name: 'Amazon S3',        note: 's3:s3.amazonaws…' },
  { name: 'Backblaze B2',     note: 'b2:bucket'        },
  { name: 'Wasabi',           note: 's3-compatible'    },
  { name: 'Cloudflare R2',    note: 's3-compatible'    },
  { name: 'Azure Blob',       note: 'azure:container'  },
  { name: 'Google Cloud',     note: 'gs:bucket'        },
  { name: 'rclone',           note: 'any rclone remote'},
]

export function Backends() {
  return (
    <section id="backends" style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Any backend Restic supports
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 48 }}>
          Configure the repository URL in BackupOS — the rest is Restic.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {backends.map(b => (
            <div key={b.name} style={{
              background: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 18px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 130,
            }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{b.name}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{b.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/features-grid.tsx apps/web-site/app/components/backends.tsx
git commit -m "feat(web-site): features grid + backends sections"
```

---

### Task 7: Install + OS family sections

**Files:**
- Create: `apps/web-site/app/components/install.tsx`
- Create: `apps/web-site/app/components/os-family.tsx`

- [ ] **Step 1: Create install.tsx**

```typescript
'use client'
import { useState } from 'react'

const tabs = [
  {
    label: 'Docker',
    code: `docker run -d \\
  --name backupos \\
  -p 3000:3000 \\
  -v backupos-data:/data \\
  ghcr.io/backupos/backupos:latest`,
  },
  {
    label: 'docker compose',
    code: `services:
  backupos:
    image: ghcr.io/backupos/backupos:latest
    ports: ["3000:3000"]
    volumes:
      - backupos-data:/data
volumes:
  backupos-data:`,
  },
  {
    label: 'npm',
    code: `npx backupos@latest start`,
  },
]

export function Install() {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(tabs[active].code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section id="install" style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container" style={{ maxWidth: 700 }}>
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Up and running in 60 seconds
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 36 }}>
          No external database required — SQLite included.
        </p>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
          {tabs.map((t, i) => (
            <button key={t.label} onClick={() => setActive(i)} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active === i ? 'var(--fg)' : 'var(--fg-dim)',
              borderBottom: active === i ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', background: 'var(--surf2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)' }}>
          <pre style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, overflowX: 'auto', color: 'var(--fg)' }}>
            <code>{tabs[active].code}</code>
          </pre>
          <button onClick={copy} style={{
            position: 'absolute', top: 12, right: 12,
            padding: '4px 10px', fontSize: 11, borderRadius: 4,
            background: 'var(--surf)', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'pointer',
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--fg-dim)' }}>
          Then open <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>http://localhost:3000</span>
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create os-family.tsx**

```typescript
const oses = [
  { name: 'Linux', icon: '🐧' },
  { name: 'macOS', icon: '🍎' },
  { name: 'Windows', icon: '🪟', note: 'via Docker' },
  { name: 'ARM / RPi', icon: '🦾' },
  { name: 'NAS / Synology', icon: '💾', note: 'via Docker' },
]

export function OsFamily() {
  return (
    <section style={{ padding: '40px 0 80px' }}>
      <div className="container">
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13, marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Runs on
        </p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {oses.map(o => (
            <div key={o.name} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{o.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
              {o.note && <div style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{o.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/install.tsx apps/web-site/app/components/os-family.tsx
git commit -m "feat(web-site): install snippet tabs + OS family strip"
```

---

### Task 8: Footer

**Files:**
- Create: `apps/web-site/app/components/footer.tsx`

- [ ] **Step 1: Create footer.tsx**

```typescript
const cols = [
  {
    heading: 'Product',
    links: [
      { label: 'Features',    href: '#features' },
      { label: 'Backends',    href: '#backends'  },
      { label: 'Pricing',     href: '/pricing/'  },
      { label: 'Changelog',   href: '/changelog/'},
    ],
  },
  {
    heading: 'Docs',
    links: [
      { label: 'Quick start', href: '/docs/quick-start/'    },
      { label: 'Configuration', href: '/docs/configuration/' },
      { label: 'API reference', href: '/docs/api/'          },
      { label: 'CLI',           href: '/docs/cli/'          },
    ],
  },
  {
    heading: 'Community',
    links: [
      { label: 'GitHub',        href: 'https://github.com/backupos/backupos' },
      { label: 'Discussions',   href: 'https://github.com/backupos/backupos/discussions' },
      { label: 'Issues',        href: 'https://github.com/backupos/backupos/issues'      },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy',  href: '/privacy/'  },
      { label: 'Terms',    href: '/terms/'    },
      { label: 'License',  href: 'https://github.com/backupos/backupos/blob/main/LICENSE' },
    ],
  },
]

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 56, paddingBottom: 40, background: 'var(--surf)' }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 40, marginBottom: 48 }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>BackupOS</div>
            <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, maxWidth: 200 }}>
              Open-source Restic backup management for self-hosters.
            </p>
          </div>
          {cols.map(col => (
            <div key={col.heading}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {col.heading}
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <li key={l.label}>
                    <a href={l.href} style={{ fontSize: 13, color: 'var(--fg-dim)' }}
                      target={l.href.startsWith('http') ? '_blank' : undefined}
                      rel={l.href.startsWith('http') ? 'noopener noreferrer' : undefined}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            © {new Date().getFullYear()} BackupOS. MIT License.
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            Built with Restic + Next.js
          </span>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/footer.tsx
git commit -m "feat(web-site): 5-column footer"
```

---

### Task 9: Wire page.tsx, typecheck, and build

**Files:**
- Create: `apps/web-site/app/page.tsx`

- [ ] **Step 1: Create page.tsx**

```typescript
import { Nav }          from './components/nav'
import { Hero }         from './components/hero'
import { Problem }      from './components/problem'
import { VsPbs }        from './components/vs-pbs'
import { FeaturesGrid } from './components/features-grid'
import { Backends }     from './components/backends'
import { Install }      from './components/install'
import { OsFamily }     from './components/os-family'
import { Footer }       from './components/footer'

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <VsPbs />
        <FeaturesGrid />
        <Backends />
        <Install />
        <OsFamily />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: exit 0, no errors.

- [ ] **Step 3: Build**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm build
```
Expected: `Export successful`, `out/` directory created with `index.html`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/page.tsx
git commit -m "feat(web-site): wire landing page — all sections connected, build passes"
```

---

## Self-Review

**Spec coverage:**
- [x] Static export Next.js app at `apps/web-site/` — Task 1
- [x] Design system matching dashboard amber accent — Task 2
- [x] Nav with sticky behavior — Task 3
- [x] Hero with eyebrow, headline, CTAs, terminal preview — Task 4
- [x] Problem statement + vs-plain-Restic comparison — Task 5
- [x] Features grid (8 cards) — Task 6
- [x] Backends list — Task 6
- [x] Install snippets (Docker, compose, npm) with copy — Task 7
- [x] OS compatibility strip — Task 7
- [x] 5-column footer — Task 8
- [x] Page wiring + typecheck + build — Task 9

**Placeholder scan:** None found.

**Type consistency:** `Nav`, `Hero`, `Problem`, `VsPbs`, `FeaturesGrid`, `Backends`, `Install`, `OsFamily`, `Footer` — all named exports, all imported correctly in `page.tsx`.
