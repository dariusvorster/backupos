import { readFileSync, existsSync } from 'fs'
import { join }                     from 'path'
import { notFound }                 from 'next/navigation'
import { MDXRemote }                from 'next-mdx-remote/rsc'
import { DOCS_ROOT }                from '@backupos/docs-content'

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug }   = await params
  const [section, page = 'index'] = slug
  if (!section) notFound()
  const filePath   = join(DOCS_ROOT, section, `${page}.mdx`)

  if (!existsSync(filePath)) notFound()

  const source = readFileSync(filePath, 'utf8')

  return (
    <article style={{
      maxWidth: 720, color: 'var(--fg)', lineHeight: 1.75,
      fontSize: 14,
    }}>
      <MDXRemote source={source} />
    </article>
  )
}
