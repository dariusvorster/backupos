'use client'

import { usePathname } from 'next/navigation'
import { Search, Bell } from 'lucide-react'

const LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  activity:     'Activity',
  jobs:         'Jobs',
  schedules:    'Schedules',
  snapshots:    'Snapshots',
  agents:       'Agents',
  repositories: 'Repositories',
  monitors:     'Monitors',
  restore:      'Restore specs',
  runs:         'Restore runs',
  alerts:       'Alerts',
  audit:        'Audit log',
  settings:     'Settings',
  new:          'New',
}

function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = []
  let path = ''
  for (const seg of segments) {
    path += `/${seg}`
    const label = LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
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
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16, flexShrink: 0,
    }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, minWidth: 0, flex: 1 }}>
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--fg-mute)' }}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <div style={{
        width: 320, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0 12px', height: 32, cursor: 'text',
      }}>
        <Search size={13} color="var(--fg-dim)" />
        <span style={{ fontSize: 13, color: 'var(--fg-dim)', flex: 1 }}>Search…</span>
        <kbd style={{
          fontSize: 11, color: 'var(--fg-faint)',
          backgroundColor: 'var(--surf2)',
          border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 5px',
          fontFamily: 'var(--font-mono)',
        }}>⌘K</kbd>
      </div>

      <button
        title="Notifications"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--fg-mute)',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <Bell size={16} />
      </button>
    </header>
  )
}
