'use client'

import { useEffect, useState } from 'react'

type Status = 'checking' | 'online' | 'offline'

export function MountStatusBadge({ repoId }: { repoId: string }) {
  const [status, setStatus] = useState<Status>('checking')

  async function check() {
    setStatus('checking')
    try {
      const res  = await fetch(`/api/repos/${repoId}/test-mount`, { method: 'POST' })
      const body = await res.json() as { ok?: boolean }
      setStatus(res.ok && body.ok ? 'online' : 'offline')
    } catch {
      setStatus('offline')
    }
  }

  useEffect(() => { void check() }, [])

  const dot: React.CSSProperties = {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    backgroundColor:
      status === 'checking' ? 'var(--fg-faint)'
      : status === 'online'  ? 'var(--ok)'
      : 'var(--err)',
    boxShadow:
      status === 'online' ? '0 0 0 2px color-mix(in srgb, var(--ok) 25%, transparent)' : undefined,
  }

  const label =
    status === 'checking' ? 'Checking…'
    : status === 'online'  ? 'Share reachable'
    : 'Share unreachable'

  const color =
    status === 'checking' ? 'var(--fg-mute)'
    : status === 'online'  ? 'var(--ok)'
    : 'var(--err)'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surf2)',
      fontSize: 12, color,
      cursor: status !== 'checking' ? 'pointer' : 'default',
      userSelect: 'none',
    }}
    title={status !== 'checking' ? 'Click to re-check' : undefined}
    onClick={() => { if (status !== 'checking') void check() }}
    >
      <span style={dot} />
      {label}
    </div>
  )
}
