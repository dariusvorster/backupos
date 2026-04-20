'use client'

import Link        from 'next/link'
import { usePathname } from 'next/navigation'
import type { Nav } from '@backupos/docs-content'

export function DocsNav({ nav }: { nav: Nav }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220, minWidth: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      overflowY: 'auto', padding: '16px 0',
    }}>
      {nav.sections.map(section => (
        <div key={section.slug} style={{ marginBottom: 8 }}>
          <div style={{
            padding: '4px 16px', fontSize: 11, fontWeight: 500,
            color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {section.title}
          </div>
          {section.pages.map(page => {
            const href    = `/docs/${section.slug}/${page.slug}`
            const active  = pathname === href
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
    </aside>
  )
}
