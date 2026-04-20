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
