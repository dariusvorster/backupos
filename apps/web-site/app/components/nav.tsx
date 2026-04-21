'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'

const links = [
  { label: 'Features',    href: '#features'  },
  { label: 'Backends',    href: '#backends'   },
  { label: 'Install',     href: '#install'    },
  { label: 'Pricing',     href: '/pricing/'   },
  { label: 'Docs',        href: '/docs/'      },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      transition: 'all 0.2s',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', height: 60, gap: 32 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 16 }}>
          <Image src="/logo.svg" alt="BackupOS" width={28} height={28} />
          BackupOS
        </a>

        <nav style={{ display: 'flex', gap: 28, marginLeft: 8, flex: 1 }} aria-label="Main">
          {links.map(l => (
            <a key={l.label} href={l.href} style={{
              fontSize: 14, color: 'var(--fg-dim)',
              transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-dim)')}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="https://github.com/backupos/backupos" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
            GitHub
          </a>
          <a href="/app/" style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#000',
          }}>
            Get started
          </a>
        </div>
      </div>
    </header>
  )
}
