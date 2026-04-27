import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { notFound }      from 'next/navigation'
import { MDXRemote }     from 'next-mdx-remote/rsc'
import { nav }           from '@backupos/docs-content'
import type { Metadata } from 'next'
import { Note }              from '@/components/mdx/note'
import { Tip }               from '@/components/mdx/tip'
import { FeatureComparison } from '@/components/mdx/feature-comparison'
import { GlossaryTable }     from '@/components/mdx/glossary-table'

const mdxComponents = { Note, Tip, FeatureComparison, GlossaryTable }

const DOCS_ROOT = resolve(process.cwd(), '../../packages/docs-content/content')

function readDocSource(filePath: string): string | null {
  try { return readFileSync(filePath, 'utf8') } catch { return null }
}

function extractFrontmatterField(source: string, field: string): string | undefined {
  const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return undefined
  const fm = fmMatch[1]
  const lineMatch = fm.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'))
  return lineMatch?.[1]?.replace(/^['"]|['"]$/g, '').trim()
}

export async function generateStaticParams() {
  return nav.sections.flatMap(section =>
    section.pages.map(page => ({ slug: [section.slug, page.slug] }))
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
  const source = readDocSource(filePath)
  if (!source) return {}
  const title       = extractFrontmatterField(source, 'title')
  const description = extractFrontmatterField(source, 'description')
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) }
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

  const source = readDocSource(filePath)
  if (!source) notFound()

  return <MDXRemote source={source} components={mdxComponents} />
}
