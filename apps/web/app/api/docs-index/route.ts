export const dynamic = 'force-dynamic'

import { readFile }    from 'fs/promises'
import { join, resolve } from 'path'
import { NextResponse }  from 'next/server'
import { nav }           from '@backupos/docs-content'

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
    .replace(/^---[\s\S]*?---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_|>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET() {
  const entries: DocEntry[] = []

  for (const section of nav.sections) {
    for (const page of section.pages) {
      const filePath = resolve(join(DOCS_ROOT, section.slug, `${page.slug}.mdx`))
      try {
        const raw     = await readFile(filePath, 'utf8')
        const excerpt = stripMdx(raw).slice(0, 300)
        entries.push({
          id:      `${section.slug}/${page.slug}`,
          title:   page.title,
          section: section.title,
          slug:    `${section.slug}/${page.slug}`,
          href:    `/docs/${section.slug}/${page.slug}`,
          excerpt,
        })
      } catch {
        continue
      }
    }
  }

  return NextResponse.json(entries)
}
