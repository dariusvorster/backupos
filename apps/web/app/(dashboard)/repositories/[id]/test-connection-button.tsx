'use client'

import { useState } from 'react'

export function TestConnectionButton({ repoId }: { repoId: string }) {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [detail, setDetail] = useState<string | null>(null)

  async function handleClick() {
    setState('testing')
    setDetail(null)
    try {
      const res = await fetch(`/api/repos/${repoId}/test`, { method: 'POST' })
      const body = await res.json() as { ok?: boolean; error?: string; snapshotCount?: number }
      if (!res.ok || !body.ok) {
        setState('error')
        setDetail(body.error ?? 'Connection failed')
      } else {
        setState('ok')
        setDetail(body.snapshotCount != null ? `${body.snapshotCount} snapshot(s) found` : 'Connected')
      }
    } catch {
      setState('error')
      setDetail('Network error')
    }
  }

  const color = state === 'ok' ? 'var(--ok)' : state === 'error' ? 'var(--err)' : 'var(--fg-mute)'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { void handleClick() }}
        disabled={state === 'testing'}
        style={{
          padding: '6px 14px', fontSize: 13, cursor: state === 'testing' ? 'wait' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surf2)', color: 'var(--fg)',
        }}
      >
        {state === 'testing' ? 'Testing…' : 'Test connection'}
      </button>
      {detail && (
        <span style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          fontSize: 11, color, whiteSpace: 'nowrap',
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          zIndex: 10,
        }}>
          {state === 'ok' ? '✓ ' : '✗ '}{detail}
        </span>
      )}
    </div>
  )
}
