'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Activity, PlayCircle, Clock, Camera,
  Server, Database, Radar, RotateCcw, ListRestart,
  TriangleAlert, FileClock, Settings, Sun, LogOut, ShieldCheck,
} from 'lucide-react'

interface NavItem  { href: string; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
      { href: '/activity',  label: 'Activity',  icon: <Activity size={16} /> },
    ],
  },
  {
    label: 'BACKUP',
    items: [
      { href: '/jobs',      label: 'Jobs',      icon: <PlayCircle size={16} /> },
      { href: '/schedules', label: 'Schedules', icon: <Clock size={16} /> },
      { href: '/snapshots',     label: 'Snapshots',     icon: <Camera size={16} /> },
      { href: '/verification', label: 'Verification', icon: <ShieldCheck size={16} /> },
    ],
  },
  {
    label: 'INFRASTRUCTURE',
    items: [
      { href: '/agents',       label: 'Agents',       icon: <Server size={16} /> },
      { href: '/repositories', label: 'Repositories', icon: <Database size={16} /> },
      { href: '/monitors',     label: 'Monitors',     icon: <Radar size={16} /> },
    ],
  },
  {
    label: 'RESTORE',
    items: [
      { href: '/restore',      label: 'Restore specs', icon: <RotateCcw size={16} /> },
      { href: '/restore/runs', label: 'Restore runs',  icon: <ListRestart size={16} /> },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/alerts', label: 'Alerts',    icon: <TriangleAlert size={16} /> },
      { href: '/audit',  label: 'Audit log', icon: <FileClock size={16} /> },
    ],
  },
]

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 56, flexShrink: 0 }}>
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="16" fill="#1A1206" />
        <rect x="4"  y="4"  width="19" height="19" fill="#F5A623" />
        <rect x="25" y="4"  width="19" height="19" fill="#854F0B" />
        <rect x="4"  y="25" width="19" height="19" fill="#854F0B" />
        <rect x="25" y="25" width="19" height="19" fill="#C77A14" />
        <rect x="14" y="14" width="20" height="20" fill="#FEF5E0" />
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
      width: 240, minWidth: 240,
      backgroundColor: 'var(--bg2)',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <Logo />

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        {NAV.map(group => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 11, color: 'var(--fg-dim)',
              letterSpacing: '0.08em', fontWeight: 500,
              padding: '12px 8px 4px', textTransform: 'uppercase',
            }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href
                || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 8px', height: 36,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: active ? 500 : 400,
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

      <div style={{ padding: '8px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <Link
            href="/settings"
            title="Settings"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', color: 'var(--fg-mute)', textDecoration: 'none' }}
          >
            <Settings size={16} />
          </Link>
          <button
            title="Toggle theme (v2)"
            disabled
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', color: 'var(--fg-faint)', background: 'none', border: 'none', cursor: 'not-allowed' }}
          >
            <Sun size={16} />
          </button>
          <button
            title="Log out"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', color: 'var(--fg-mute)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <LogOut size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            backgroundColor: 'var(--accent-deep)',
            color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}>
            A
          </div>
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>Admin</span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          Solo · v0.1.0
        </div>
      </div>
    </aside>
  )
}
