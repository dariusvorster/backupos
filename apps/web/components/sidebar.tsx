'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Activity, PlayCircle, Clock, Camera,
  Server, Database, Radar, RotateCcw, ListRestart,
  TriangleAlert, FileClock, Settings, BookOpen, FileTerminal, ShieldCheck,
  KeyRound, HardDrive,
} from 'lucide-react'
import { ProfilePopover } from './profile-popover'

interface NavItem  { href: string; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }
interface SidebarUser { name: string; email: string; image?: string | null }

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
      { href: '/activity',  label: 'Activity',  icon: <Activity size={15} /> },
      { href: '/logs',      label: 'Logs',      icon: <FileTerminal size={15} /> },
      { href: '/docs',      label: 'Docs',      icon: <BookOpen size={15} /> },
    ],
  },
  {
    label: 'Backup',
    items: [
      { href: '/jobs',         label: 'Jobs',         icon: <PlayCircle size={15} /> },
      { href: '/schedules',    label: 'Schedules',    icon: <Clock size={15} /> },
      { href: '/snapshots',    label: 'Snapshots',    icon: <Camera size={15} /> },
      { href: '/verification', label: 'Verification', icon: <ShieldCheck size={15} /> },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/agents',       label: 'Agents',       icon: <Server size={15} /> },
      { href: '/repositories', label: 'Repositories', icon: <Database size={15} /> },
      { href: '/monitors',     label: 'Monitors',     icon: <Radar size={15} /> },
    ],
  },
  {
    label: 'PBS',
    items: [
      { href: '/pbs/tokens',         label: 'Tokens',     icon: <KeyRound  size={15} /> },
      { href: '/pbs/datastores/new', label: 'Datastores', icon: <HardDrive size={15} /> },
    ],
  },
  {
    label: 'Restore',
    items: [
      { href: '/restore',      label: 'Restore specs', icon: <RotateCcw size={15} /> },
      { href: '/restore/runs', label: 'Restore runs',  icon: <ListRestart size={15} /> },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/alerts',   label: 'Alerts',    icon: <TriangleAlert size={15} /> },
      { href: '/audit',    label: 'Audit log', icon: <FileClock size={15} /> },
      { href: '/settings', label: 'Settings',  icon: <Settings size={15} /> },
    ],
  },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function Logo() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 16px', height: 52, flexShrink: 0,
      borderBottom: '1px solid var(--border2)',
    }}>
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="12" fill="#1A1206" />
        <rect x="6"  y="6"  width="16" height="16" rx="3" fill="#F5A623" />
        <rect x="26" y="6"  width="16" height="16" rx="3" fill="#854F0B" />
        <rect x="6"  y="26" width="16" height="16" rx="3" fill="#854F0B" />
        <rect x="26" y="26" width="16" height="16" rx="3" fill="#C77A14" />
        <rect x="18" y="18" width="12" height="12" rx="3" fill="#FEF5E0" />
      </svg>
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--fg)' }}>Backup</span>
        <span style={{ color: 'var(--accent)' }}>OS</span>
      </span>
    </div>
  )
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname()
  const allHrefs = NAV.flatMap(g => g.items.map(i => i.href))

  return (
    <aside style={{
      width: 228, minWidth: 228,
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
              fontSize: 10, color: 'var(--fg-faint)',
              letterSpacing: '0.07em', fontWeight: 600,
              padding: '10px 8px 4px', textTransform: 'uppercase',
            }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href
                || (
                  item.href !== '/dashboard'
                  && pathname.startsWith(item.href + '/')
                  && !allHrefs.some(h => h !== item.href && pathname.startsWith(h) && h.startsWith(item.href + '/'))
                )
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 8px 0 6px', height: 34,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--accent-deep)' : 'var(--fg-dim)',
                    backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'background-color 0.12s, color 0.12s',
                    marginBottom: 1,
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

      <div style={{
        padding: '10px 10px 12px',
        borderTop: '1px solid var(--border2)',
      }}>
        <ProfilePopover user={user} />
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>
          Solo · v0.1.0
        </div>
      </div>
    </aside>
  )
}
