import { readFileSync, existsSync } from 'fs'
import { join, resolve }            from 'path'
import { notFound }                 from 'next/navigation'
import { MDXRemote }                from 'next-mdx-remote/rsc'
import { getMdxComponents }         from '../mdx-components'

const DOCS_ROOT = resolve(process.cwd(), '../../packages/docs-content/content')

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug }   = await params
  if (slug.length > 2) notFound()
  const [section, page = 'index'] = slug
  if (!section) notFound()
  const filePath   = join(DOCS_ROOT, section, `${page}.mdx`)
  const resolved   = resolve(filePath)
  const root       = resolve(DOCS_ROOT)

  if (!resolved.startsWith(root + '/')) notFound()
  if (!existsSync(resolved)) notFound()

  const source = readFileSync(resolved, 'utf8')

  return (
    <article style={{ maxWidth: 740, color: 'var(--fg)' }}>
      <MDXRemote source={source} components={getMdxComponents()} />
    </article>
  )
}
