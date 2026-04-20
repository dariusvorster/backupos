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
