'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from './avatar'
import { authClient } from '@/lib/auth-client'
import {
  IconUser, IconLock, IconSettings, IconLogOut,
} from '@/app/(dashboard)/docs/icons'

interface ProfileUser {
  name:   string
  email:  string
  image?: string | null
}

function MenuIcon({ Icon }: { Icon: React.ComponentType<{ size?: number }> }) {
  return (
    <span style={{
      width: 22, height: 22, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--fg-mute)',
    }}>
      <Icon size={14} />
    </span>
  )
}

export function ProfilePopover({ user }: { user: ProfileUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/login')
  }

  const MENU = [
    { href: '/settings/profile',  Icon: IconUser,     label: 'Profile' },
    { href: '/settings/security', Icon: IconLock,     label: 'Security' },
    { href: '/settings',          Icon: IconSettings, label: 'Settings' },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        }}
      >
        <Avatar src={user.image} name={user.name} size={32} />
        <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, flex: 1, textAlign: 'left' }}>
          {user.name}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          width: 280,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 200,
        }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <Avatar src={user.image} name={user.name} size={48} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Solo · v0.1.0</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {MENU.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 16px', height: 36, fontSize: 13,
                color: 'var(--fg)', textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surf2)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <MenuIcon Icon={item.Icon} />
              {item.label}
              <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 12 }}>→</span>
            </Link>
          ))}

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0 16px', height: 36, fontSize: 13,
              color: 'var(--fg)', background: 'none', border: 'none', cursor: 'pointer',
              borderBottomLeftRadius: 'var(--radius)', borderBottomRightRadius: 'var(--radius)',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--surf2)'; e.currentTarget.style.color = 'var(--err)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--fg)' }}
          >
            <MenuIcon Icon={IconLogOut} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
