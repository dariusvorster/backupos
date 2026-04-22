# External Docs Site + MiniSearch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/docs` — a Next.js static-export docs site using `packages/docs-content/` — and add MiniSearch client-side full-text search to the in-app `/docs` section.

**Architecture:** `apps/docs` is a standalone Next.js 15 app (`output: 'export'`) that renders the same MDX content as the in-app viewer, deployed to any static host. MiniSearch lives entirely in `apps/web`: a route handler at `/api/docs-index` returns a JSON index of all doc pages; a `DocsSearch` client component fetches it once, indexes it with MiniSearch, and renders a dropdown inside the existing `DocsNav` sidebar.

**Tech Stack:** Next.js 15 (`output: 'export'`), `next-mdx-remote/rsc`, MiniSearch, pnpm workspaces.

---

## File Map

| File | Action |
|---|---|
| `apps/docs/package.json` | Create — standalone Next.js static-export app |
| `apps/docs/tsconfig.json` | Create — TypeScript config |
| `apps/docs/next.config.ts` | Create — `output: 'export'`, `trailingSlash: true` |
| `apps/docs/app/globals.css` | Create — minimal light-theme typography |
| `apps/docs/app/layout.tsx` | Create — shell with DocsNav sidebar |
| `apps/docs/app/page.tsx` | Create — docs home page listing all sections |
| `apps/docs/app/[...slug]/page.tsx` | Create — MDX renderer with `generateStaticParams` |
| `apps/docs/components/docs-nav.tsx` | Create — sticky sidebar nav (client component) |
| `apps/web/app/api/docs-index/route.ts` | Create — JSON index of all doc pages for MiniSearch |
| `apps/web/app/(dashboard)/docs/search.tsx` | Create — DocsSearch client component |
| `apps/web/app/(dashboard)/docs/nav.tsx` | Modify — add DocsSearch at top of sidebar |
| `apps/web/package.json` | Modify — add `minisearch` dependency |

---

### Task 1: `apps/docs` scaffold — package.json, tsconfig.json, next.config.ts

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/next.config.ts`

- [ ] **Step 1: Create `apps/docs/package.json`**

```json
{
  "name": "@backupos/docs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "npx serve out"
  },
  "dependencies": {
    "@backupos/docs-content": "workspace:*",
    "next": "^15.0.0",
    "next-mdx-remote": "^6.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `apps/docs/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
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
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/docs/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
}

export default config
```

- [ ] **Step 4: Install deps**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm install
```

Expected: `@backupos/docs` installed, workspace dep `@backupos/docs-content` linked.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/docs/package.json apps/docs/tsconfig.json apps/docs/next.config.ts pnpm-lock.yaml
git commit -m "feat: apps/docs static site scaffold"
```

---

### Task 2: `apps/docs` routes — layout, page, slug renderer, DocsNav

**Files:**
- Create: `apps/docs/app/globals.css`
- Create: `apps/docs/app/layout.tsx`
- Create: `apps/docs/app/page.tsx`
- Create: `apps/docs/app/[...slug]/page.tsx`
- Create: `apps/docs/components/docs-nav.tsx`

- [ ] **Step 1: Create `apps/docs/app/globals.css`**

```css
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  font-size: 15px;
  line-height: 1.65;
  color: #1a1a1a;
  background: #fff;
}

a { color: #d97706; text-decoration: none; }
a:hover { text-decoration: underline; }

h1 { font-size: 1.9rem; font-weight: 700; margin: 0 0 24px; line-height: 1.2; }
h2 { font-size: 1.35rem; font-weight: 600; margin: 36px 0 12px; }
h3 { font-size: 1.05rem; font-weight: 600; margin: 24px 0 8px; }
p  { margin: 0 0 16px; }
ul, ol { margin: 0 0 16px; padding-left: 24px; }
li { margin: 4px 0; }

pre {
  background: #f4f4f5;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
  margin: 0 0 16px;
  line-height: 1.5;
}

code {
  background: #f4f4f5;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
}

pre code { background: none; padding: 0; }

table { border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 14px; }
th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
th { background: #f9fafb; font-weight: 600; }

blockquote {
  border-left: 3px solid #d1d5db;
  margin: 0 0 16px;
  padding: 8px 16px;
  color: #6b7280;
}

hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
```

- [ ] **Step 2: Create `apps/docs/app/layout.tsx`**

```typescript
import './globals.css'
import type { Metadata } from 'next'
import { nav } from '@backupos/docs-content'
import { DocsNav } from '../components/docs-nav'

export const metadata: Metadata = {
  title: { default: 'BackupOS Docs', template: '%s | BackupOS Docs' },
  description: 'Documentation for BackupOS — unified backup management.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <DocsNav nav={nav} />
          <main style={{ flex: 1, padding: '48px 56px', maxWidth: 800, minWidth: 0 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Create `apps/docs/app/page.tsx`**

This page lists all sections so the static root is useful (no server-side redirect needed for a static export).

```typescript
import Link from 'next/link'
import { nav } from '@backupos/docs-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'BackupOS Docs' }

export default function HomePage() {
  return (
    <div>
      <h1>BackupOS Documentation</h1>
      <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 32 }}>
        Unified backup management for homelabs and small businesses.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {nav.sections.map(section => (
          <Link
            key={section.slug}
            href={`/${section.slug}/${section.pages[0].slug}`}
            style={{
              display: 'block', padding: '16px 20px',
              border: '1px solid #e5e7eb', borderRadius: 8,
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{section.title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {section.pages.length} {section.pages.length === 1 ? 'page' : 'pages'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/docs/app/[...slug]/page.tsx`**

```typescript
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { notFound }      from 'next/navigation'
import { MDXRemote }     from 'next-mdx-remote/rsc'
import { nav }           from '@backupos/docs-content'
import type { Metadata } from 'next'

const DOCS_ROOT = resolve(process.cwd(), '../../packages/docs-content/content')

function extractFrontmatterField(source: string, field: string): string | undefined {
  const match = source.match(new RegExp(`^---[\\s\\S]*?${field}:\\s*(.+?)[\\r\\n]`, 'm'))
  return match?.[1]?.replace(/^['"]|['"]$/g, '').trim()
}

export async function generateStaticParams() {
  return nav.sections.flatMap(section =>
    section.pages.map(page => ({
      slug: [section.slug, page.slug],
    }))
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  if (slug.length !== 2) return {}
  const [section, page] = slug
  const filePath = resolve(join(DOCS_ROOT, section, `${page}.mdx`))
  try {
    const source      = readFileSync(filePath, 'utf8')
    const title       = extractFrontmatterField(source, 'title')
    const description = extractFrontmatterField(source, 'description')
    return { ...(title ? { title } : {}), ...(description ? { description } : {}) }
  } catch {
    return {}
  }
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  if (slug.length !== 2) notFound()

  const [section, page] = slug
  const filePath = resolve(join(DOCS_ROOT, section, `${page}.mdx`))
  const root     = resolve(DOCS_ROOT)

  if (!filePath.startsWith(root + '/')) notFound()

  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    notFound()
  }

  return <MDXRemote source={source!} />
}
```

- [ ] **Step 5: Create `apps/docs/components/docs-nav.tsx`**

```typescript
'use client'

import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import type { Nav }    from '@backupos/docs-content'

export function DocsNav({ nav }: { nav: Nav }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 240, minWidth: 240, flexShrink: 0,
      borderRight: '1px solid #e5e7eb',
      overflowY: 'auto', padding: '0',
      position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>
          <span>Backup</span><span style={{ color: '#d97706' }}>OS</span>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Documentation</div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 8 }}>
        {nav.sections.map(section => (
          <div key={section.slug} style={{ marginBottom: 8 }}>
            <div style={{
              padding: '4px 16px', fontSize: 11, fontWeight: 600,
              color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {section.title}
            </div>
            {section.pages.map(page => {
              const href   = `/${section.slug}/${page.slug}`
              const active = pathname === href || pathname === href + '/'
              return (
                <Link key={page.slug} href={href} style={{
                  display: 'block', padding: '5px 16px', fontSize: 13,
                  textDecoration: 'none',
                  color: active ? '#d97706' : '#6b7280',
                  backgroundColor: active ? '#fffbeb' : 'transparent',
                  borderLeft: active ? '2px solid #d97706' : '2px solid transparent',
                }}>
                  {page.title}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/docs && pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: clean (or only `next-env.d.ts` not found — run `pnpm build` once to generate it if needed).

- [ ] **Step 7: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/docs/
git commit -m "feat: apps/docs static site — layout, pages, MDX renderer, DocsNav"
```

---

### Task 3: MiniSearch — docs index API route

**Files:**
- Create: `apps/web/app/api/docs-index/route.ts`
- Modify: `apps/web/package.json` (add `minisearch`)

- [ ] **Step 1: Install minisearch in apps/web**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web add minisearch
```

Expected: `minisearch` added to `apps/web/package.json`.

- [ ] **Step 2: Create `apps/web/app/api/docs-index/route.ts`**

```typescript
import { readFileSync, existsSync } from 'fs'
import { join, resolve }             from 'path'
import { NextResponse }              from 'next/server'
import { nav }                       from '@backupos/docs-content'

const DOCS_ROOT = resolve(process.cwd(), '../../packages/docs-content/content')

export interface DocEntry {
  id:      string
  title:   string
  section: string
  slug:    string
  href:    string
  excerpt: string
}

function stripMdx(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_|>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function GET() {
  const entries: DocEntry[] = []

  for (const section of nav.sections) {
    for (const page of section.pages) {
      const filePath = resolve(join(DOCS_ROOT, section.slug, `${page.slug}.mdx`))
      if (!existsSync(filePath)) continue

      const raw     = readFileSync(filePath, 'utf8')
      const excerpt = stripMdx(raw).slice(0, 300)

      entries.push({
        id:      `${section.slug}/${page.slug}`,
        title:   page.title,
        section: section.title,
        slug:    `${section.slug}/${page.slug}`,
        href:    `/docs/${section.slug}/${page.slug}`,
        excerpt,
      })
    }
  }

  return NextResponse.json(entries)
}
```

- [ ] **Step 3: Verify the route returns data**

Start the dev server or check via curl once running. The route should return a JSON array with ~50 entries (one per doc page).

Expected shape:
```json
[
  { "id": "introduction/what-is-backupos", "title": "What is BackupOS", "section": "Introduction", "slug": "introduction/what-is-backupos", "href": "/docs/introduction/what-is-backupos", "excerpt": "BackupOS is a unified..." },
  ...
]
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/app/api/docs-index/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat: /api/docs-index route for MiniSearch"
```

---

### Task 4: DocsSearch client component + DocsNav integration

**Files:**
- Create: `apps/web/app/(dashboard)/docs/search.tsx`
- Modify: `apps/web/app/(dashboard)/docs/nav.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/docs/search.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import Link                             from 'next/link'
import MiniSearch                       from 'minisearch'

interface DocEntry {
  id:      string
  title:   string
  section: string
  slug:    string
  href:    string
  excerpt: string
}

interface SearchResult {
  id:      string
  title:   string
  section: string
  href:    string
}

let _miniSearch: MiniSearch<DocEntry> | null = null
let _indexPromise: Promise<void> | null      = null

function ensureIndex(): Promise<void> {
  if (_indexPromise) return _indexPromise
  _indexPromise = fetch('/api/docs-index')
    .then(r => r.json() as Promise<DocEntry[]>)
    .then(entries => {
      _miniSearch = new MiniSearch<DocEntry>({
        fields:       ['title', 'section', 'excerpt'],
        storeFields:  ['title', 'section', 'href'],
        searchOptions: { prefix: true, fuzzy: 0.2 },
      })
      _miniSearch.addAll(entries)
    })
  return _indexPromise
}

export function DocsSearch() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open,    setOpen]    = useState(false)
  const containerRef          = useRef<HTMLDivElement>(null)

  useEffect(() => { ensureIndex() }, [])

  useEffect(() => {
    if (!query.trim() || !_miniSearch) {
      setResults([])
      setOpen(false)
      return
    }
    const hits = _miniSearch.search(query, { limit: 8 }) as SearchResult[]
    setResults(hits)
    setOpen(hits.length > 0)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <input
        type="search"
        placeholder="Search docs…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 12,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--surf2)', color: 'var(--fg)', outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% - 2px)', left: 12, right: 12,
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 50, maxHeight: 320, overflowY: 'auto',
        }}>
          {results.map(r => (
            <Link
              key={r.id}
              href={r.href}
              onClick={() => { setOpen(false); setQuery('') }}
              style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{r.section}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Read current `apps/web/app/(dashboard)/docs/nav.tsx`**

Read `/Users/dariusvorster/Projects/backupos/apps/web/app/(dashboard)/docs/nav.tsx` to see the current code before editing.

- [ ] **Step 3: Modify nav.tsx to include DocsSearch**

Replace the entire file content with the following (it adds `DocsSearch` at the top of the aside, restructuring the padding so the search box is flush and the sections scroll independently):

```typescript
'use client'

import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import type { Nav }    from '@backupos/docs-content'
import { DocsSearch }  from './search'

export function DocsNav({ nav }: { nav: Nav }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220, minWidth: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <DocsSearch />
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 8 }}>
        {nav.sections.map(section => (
          <div key={section.slug} style={{ marginBottom: 8 }}>
            <div style={{
              padding: '4px 16px', fontSize: 11, fontWeight: 500,
              color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {section.title}
            </div>
            {section.pages.map(page => {
              const href   = `/docs/${section.slug}/${page.slug}`
              const active = pathname === href
              return (
                <Link key={page.slug} href={href} style={{
                  display: 'block', padding: '5px 16px', fontSize: 13,
                  textDecoration: 'none',
                  color: active ? 'var(--accent)' : 'var(--fg-mute)',
                  backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                  {page.title}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/docs/search.tsx" "apps/web/app/(dashboard)/docs/nav.tsx"
git commit -m "feat: DocsSearch MiniSearch component wired into docs sidebar"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| `apps/docs` external static site built from `packages/docs-content/` | Tasks 1–2 |
| All 9 sections × all pages rendered in `apps/docs` | Task 2 (`generateStaticParams`) |
| Open Graph / page title metadata per doc page | Task 2 (`generateMetadata`) |
| MiniSearch in-app search indexing all doc pages | Tasks 3–4 |
| Search box in docs sidebar | Task 4 |
| Fuzzy + prefix matching | Task 4 (`fuzzy: 0.2, prefix: true`) |
| Results show title + section | Task 4 |
| Click result navigates and clears query | Task 4 |

### Placeholder scan

No TBDs, no TODOs. All code blocks complete.

### Type consistency

- `DocEntry` interface is defined in `route.ts` and re-declared locally in `search.tsx` — intentional: the client component cannot import server-only modules. Both match shape exactly.
- `SearchResult` in `search.tsx` is a subset of `DocEntry` (only the stored fields MiniSearch returns).
- `nav` imported from `@backupos/docs-content` typed as `Nav` throughout.
- `DOCS_ROOT` uses `process.cwd()` (not `__dirname`) in both `apps/docs` and `apps/web/app/api/docs-index/route.ts` — consistent with the fix from v2-16.
