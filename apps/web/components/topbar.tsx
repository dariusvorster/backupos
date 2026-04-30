'use client'

import { usePathname } from 'next/navigation'
import { Search, Bell, ShieldAlert } from 'lucide-react'
import { useDrMode } from '@/components/dr-mode-provider'
import { useCommandPalette } from '@/components/command-palette-provider'
import { useBreadcrumb } from '@/components/breadcrumb-provider'

const LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  activity:     'Activity',
  logs:         'Logs',
  jobs:         'Jobs',
  schedules:    'Schedules',
  snapshots:    'Snapshots',
  agents:       'Agents',
  repositories: 'Repositories',
  monitors:     'Monitors',
  restore:      'Restore',
  runs:         'Runs',
  alerts:       'Alerts',
  audit:        'Audit log',
  settings:     'Settings',
  new:          'New',
  verification: 'Verification',
  docs:         'Docs',
  host:         'Host',
  job:          'Job',
  'infra-os':   'Coverage',
}

function buildBreadcrumb(
  pathname: string,
  overrides: Record<string, string>,
): { label: string; href: string }[] {
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = []
  let path = ''
  for (const seg of segments) {
    path += `/${seg}`
    const label = overrides[seg] ?? LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, href: path })
  }
  return crumbs
}

export function Topbar() {
  const pathname                         = usePathname()
  const { overrides }                    = useBreadcrumb()
  const crumbs                           = buildBreadcrumb(pathname, overrides)
  const { active, toggle, hasFailed24h } = useDrMode()
  const { openPalette }                  = useCommandPalette()

  const pulse = hasFailed24h && !active

  return (
    <>
      {pulse && (
        <style>{`
          @keyframes dr-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.35; }
          }
        `}</style>
      )}
      <header style={{
        height: 52,
        backgroundColor: active
          ? 'color-mix(in srgb, var(--bg2) 92%, #cc0000 8%)'
          : 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12, flexShrink: 0,
        transition: 'background-color 0.3s ease',
      }}>
        {/* Breadcrumb */}
        <nav style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, minWidth: 0, flex: 1,
        }}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              {i > 0 && (
                <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>/</span>
              )}
              <span style={{
                color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--fg-dim)',
                fontWeight: i === crumbs.length - 1 ? 600 : 400,
              }}>
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        {/* Search */}
        <div
          onClick={openPalette}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && openPalette()}
          style={{
            width: 220, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 10px', height: 32, cursor: 'pointer',
          }}
        >
          <Search size={12} color="var(--fg-faint)" />
          <span style={{ fontSize: 12, color: 'var(--fg-faint)', flex: 1 }}>Search…</span>
          <kbd style={{
            fontSize: 10, color: 'var(--fg-faint)',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
          }}>⌘K</kbd>
        </div>

        {/* DR Mode */}
        <button
          onClick={toggle}
          title={active ? 'Exit DR Mode (⌘⇧D)' : 'Enter DR Mode (⌘⇧D)'}
          aria-pressed={active}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: active || pulse ? 'var(--err)' : 'var(--fg-faint)',
            background: active ? 'var(--err-dim)' : 'none',
            border: active ? '1px solid color-mix(in srgb, var(--err-dim) 50%, var(--err) 50%)' : 'none',
            cursor: 'pointer',
            animation: pulse ? 'dr-pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          <ShieldAlert size={15} />
        </button>

        {/* Notifications */}
        <button
          title="Notifications"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-faint)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <Bell size={15} />
        </button>
      </header>
    </>
  )
}
