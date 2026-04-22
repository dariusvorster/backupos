'use client'

import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import type { Nav }    from '@backupos/docs-content'
import { DocsSearch }  from './search'
import {
  IconBook, IconRocket, IconLightbulb, IconWrench,
  IconFileText, IconSettings, IconLink, IconShield, IconBell,
} from './icons'

function SectionIcon({ slug }: { slug: string }) {
  const props = { size: 13, style: { flexShrink: 0 as const } }
  switch (slug) {
    case 'introduction':    return <IconBook {...props} />
    case 'getting-started': return <IconRocket {...props} />
    case 'concepts':        return <IconLightbulb {...props} />
    case 'how-to':          return <IconWrench {...props} />
    case 'reference':       return <IconFileText {...props} />
    case 'operations':      return <IconSettings {...props} />
    case 'integrations':    return <IconLink {...props} />
    case 'security':        return <IconShield {...props} />
    case 'release-notes':   return <IconBell {...props} />
    default:                return <span style={{ width: 13, display: 'inline-block', opacity: 0.4 }}>·</span>
  }
}

export function DocsNav({ nav }: { nav: Nav }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 248,
      minWidth: 248,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--surf)',
    }}>
      <DocsSearch />
      <nav style={{ overflowY: 'auto', flex: 1, padding: '8px 0 24px' }}>
        {nav.sections.map(section => (
          <div key={section.slug} style={{ marginBottom: 4 }}>
            {/* Section header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '10px 16px 4px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--fg-mute)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              <SectionIcon slug={section.slug} />
              {section.title}
            </div>

            {/* Pages */}
            {section.pages.map(page => {
              const href   = `/docs/${section.slug}/${page.slug}`
              const active = pathname === href
              return (
                <Link
                  key={page.slug}
                  href={href}
                  style={{
                    display: 'block',
                    padding: '6px 16px 6px 36px',
                    fontSize: 13,
                    textDecoration: 'none',
                    color: active ? 'var(--accent)' : 'var(--fg-mute)',
                    backgroundColor: active ? 'rgba(245,166,35,0.08)' : 'transparent',
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    fontWeight: active ? 500 : 400,
                    transition: 'background 0.1s, color 0.1s',
                  }}
                >
                  {page.title}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
