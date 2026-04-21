const cols = [
  {
    heading: 'Product',
    links: [
      { label: 'Features',    href: '#features' },
      { label: 'Backends',    href: '#backends'  },
      { label: 'Pricing',     href: '/pricing/'  },
      { label: 'Changelog',   href: '/changelog/'},
    ],
  },
  {
    heading: 'Docs',
    links: [
      { label: 'Quick start', href: '/docs/quick-start/'    },
      { label: 'Configuration', href: '/docs/configuration/' },
      { label: 'API reference', href: '/docs/api/'          },
      { label: 'CLI',           href: '/docs/cli/'          },
    ],
  },
  {
    heading: 'Community',
    links: [
      { label: 'GitHub',        href: 'https://github.com/backupos/backupos' },
      { label: 'Discussions',   href: 'https://github.com/backupos/backupos/discussions' },
      { label: 'Issues',        href: 'https://github.com/backupos/backupos/issues'      },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy',  href: '/privacy/'  },
      { label: 'Terms',    href: '/terms/'    },
      { label: 'License',  href: 'https://github.com/backupos/backupos/blob/main/LICENSE' },
    ],
  },
]

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 56, paddingBottom: 40, background: 'var(--surf)' }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 40, marginBottom: 48 }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>BackupOS</div>
            <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, maxWidth: 200 }}>
              Open-source Restic backup management for self-hosters.
            </p>
          </div>
          {cols.map(col => (
            <div key={col.heading}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {col.heading}
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <li key={l.label}>
                    <a href={l.href} style={{ fontSize: 13, color: 'var(--fg-dim)' }}
                      target={l.href.startsWith('http') ? '_blank' : undefined}
                      rel={l.href.startsWith('http') ? 'noopener noreferrer' : undefined}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            © {new Date().getFullYear()} BackupOS. MIT License.
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            Built with Restic + Next.js
          </span>
        </div>
      </div>
    </footer>
  )
}
