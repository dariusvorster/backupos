'use client'

import { useState, useTransition } from 'react'

interface Props {
  repoId: string
}

export function InitRepositoryButton({ repoId }: Props) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const onConfirm = () => {
    setConfirming(false)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/repos/${repoId}/init`, { method: 'POST' })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (res.ok && data.ok) {
          setResult({ ok: true, message: 'Repository initialized successfully' })
        } else {
          setResult({ ok: false, message: data.error ?? 'Initialization failed' })
        }
      } catch (err) {
        setResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {!confirming && (
        <button
          type="button"
          onClick={() => { setConfirming(true); setResult(null) }}
          disabled={pending}
          style={{
            padding: '5px 14px', fontSize: 12, cursor: pending ? 'wait' : 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surf2)', color: 'var(--fg)',
          }}
        >
          {pending ? 'Initializing…' : 'Initialize repository'}
        </button>
      )}

      {confirming && (
        <>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            Run restic init? This is destructive if the repo already has data.
          </span>
          <button
            type="button" onClick={onConfirm} disabled={pending}
            style={{
              padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)',
              background: 'var(--accent)', color: '#fff',
            }}
          >
            Confirm
          </button>
          <button
            type="button" onClick={() => setConfirming(false)} disabled={pending}
            style={{
              padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg)',
            }}
          >
            Cancel
          </button>
        </>
      )}

      {result && (
        <span style={{ fontSize: 11, color: result.ok ? 'var(--ok)' : 'var(--err)' }}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </span>
      )}
    </div>
  )
}
