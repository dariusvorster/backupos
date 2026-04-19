'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Avatar } from './avatar'

interface ProfileUser {
  name:   string
  email:  string
  image?: string | null
}

export function ProfilePopover({ user }: { user: ProfileUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const MENU = [
    { href: '/settings/profile',  icon: '👤', label: 'Profile' },
    { href: '/settings/security', icon: '🔐', label: 'Security' },
    { href: '/settings',          icon: '⚙️',  label: 'Settings' },
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
              <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
              {item.label}
              <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 12 }}>→</span>
            </Link>
          ))}

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <form action="/api/auth/sign-out" method="POST">
            <button
              type="submit"
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
              <span style={{ fontSize: 14 }}>↩️</span>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
