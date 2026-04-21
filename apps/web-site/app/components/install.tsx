'use client'
import { useState } from 'react'

const tabs = [
  {
    label: 'Docker',
    code: `docker run -d \\
  --name backupos \\
  -p 3000:3000 \\
  -v backupos-data:/data \\
  ghcr.io/backupos/backupos:latest`,
  },
  {
    label: 'docker compose',
    code: `services:
  backupos:
    image: ghcr.io/backupos/backupos:latest
    ports: ["3000:3000"]
    volumes:
      - backupos-data:/data
volumes:
  backupos-data:`,
  },
  {
    label: 'npm',
    code: `npx backupos@latest start`,
  },
]

export function Install() {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(tabs[active].code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section id="install" style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container" style={{ maxWidth: 700 }}>
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Up and running in 60 seconds
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 36 }}>
          No external database required — SQLite included.
        </p>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
          {tabs.map((t, i) => (
            <button key={t.label} onClick={() => setActive(i)} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active === i ? 'var(--fg)' : 'var(--fg-dim)',
              borderBottom: active === i ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', background: 'var(--surf2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius) var(--radius)' }}>
          <pre style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, overflowX: 'auto', color: 'var(--fg)' }}>
            <code>{tabs[active].code}</code>
          </pre>
          <button onClick={copy} style={{
            position: 'absolute', top: 12, right: 12,
            padding: '4px 10px', fontSize: 11, borderRadius: 4,
            background: 'var(--surf)', border: '1px solid var(--border)',
            color: 'var(--fg-dim)', cursor: 'pointer',
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--fg-dim)' }}>
          Then open <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>http://localhost:3000</span>
        </p>
      </div>
    </section>
  )
}
