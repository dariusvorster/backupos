'use client'

import { usePathname } from 'next/navigation'

function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const segments = pathname.replace(/^\//, '').split('/')
  const crumbs: { label: string; href: string }[] = []
  let path = ''
  for (const seg of segments) {
    path += `/${seg}`
    const label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, href: path })
  }
  return crumbs
}

export function Topbar() {
  const pathname = usePathname()
  const crumbs   = buildBreadcrumb(pathname)

  return (
    <header style={{
      height: 56,
      backgroundColor: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 8,
      flexShrink: 0,
    }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--fg-mute)' }}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>
    </header>
  )
}
