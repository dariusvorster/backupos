'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const NAV: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <Icon d="M2 5.5h12M2 10.5h12M2 2h12v12H2z" /> },
    ],
  },
  {
    label: 'BACKUP',
    items: [
      { href: '/jobs',         label: 'Jobs',         icon: <Icon d="M8 1v14M1 8h14" /> },
      { href: '/hypervisors',  label: 'Hypervisors',  icon: <Icon d="M2 4h12v8H2zM5 4V2M11 4V2M5 12v2M11 12v2" /> },
      { href: '/repositories', label: 'Repositories', icon: <Icon d="M2 4h12v8H2zM5 8h6" /> },
    ],
  },
  {
    label: 'RESTORE',
    items: [
      { href: '/restore', label: 'Restore specs', icon: <Icon d="M14 8A6 6 0 1 1 2 8M2 8l3-3M2 8l3 3" /> },
    ],
  },
  {
    label: 'INFRASTRUCTURE',
    items: [
      { href: '/agents',   label: 'Agents',   icon: <Icon d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 14s1-3 6-3 6 3 6 3" /> },
      { href: '/monitors', label: 'Monitors', icon: <Icon d="M8 14V8M5 11l3-3 3 3M2 14h12" /> },
    ],
  },
]

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 56 }}>
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#1A1206" />
        <rect x="4" y="4" width="19" height="19" fill="#F5A623" />
        <rect x="25" y="4" width="19" height="19" fill="#854F0B" />
        <rect x="4" y="25" width="19" height="19" fill="#854F0B" />
        <rect x="25" y="25" width="19" height="19" fill="#C77A14" />
        <rect x="19" y="19" width="10" height="10" fill="#FEF5E0" />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
        BackupOS
      </span>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 240,
      minWidth: 240,
      backgroundColor: 'var(--bg2)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <Logo />

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        {NAV.map(group => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 11,
              color: 'var(--fg-dim)',
              letterSpacing: '0.08em',
              padding: '12px 8px 4px',
              fontWeight: 500,
            }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 8px',
                    height: 36,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    color: active ? 'var(--accent)' : 'var(--fg-mute)',
                    backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background-color 0.15s, color 0.15s',
                    marginBottom: 2,
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: 'none', padding: '12px 16px 16px' }}>
        <Link
          href="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--fg-dim)',
            textDecoration: 'none',
            padding: '4px 0',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13.5 8c0-.4-.04-.8-.1-1.18l1.6-1.24-1.5-2.6-1.94.77A5.5 5.5 0 0 0 9.5 3l-.3-2h-2.4l-.3 2a5.5 5.5 0 0 0-2.06.75L2.5 2.98l-1.5 2.6 1.6 1.24A5.5 5.5 0 0 0 2.5 8c0 .4.04.8.1 1.18l-1.6 1.24 1.5 2.6 1.94-.77c.61.42 1.3.73 2.06.75l.3 2h2.4l.3-2a5.5 5.5 0 0 0 2.06-.75l1.94.77 1.5-2.6-1.6-1.24C13.46 8.8 13.5 8.4 13.5 8Z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Settings
        </Link>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-dim)' }}>
          Solo · v0.1.0
        </div>
      </div>
    </aside>
  )
}
