'use client'

import { useState, useTransition } from 'react'
import { testAlertChannel } from '@/app/actions/alerts'

export function TestChannelButton({ channelId }: { channelId: string }) {
  const [status, setStatus] = useState<{ kind: 'idle' | 'success' | 'error'; message?: string }>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleTest() {
    setStatus({ kind: 'idle' })
    startTransition(async () => {
      const result = await testAlertChannel({ kind: 'saved', channelId })
      if (result.ok) {
        setStatus({ kind: 'success' })
        setTimeout(() => setStatus({ kind: 'idle' }), 4000)
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={handleTest}
        disabled={isPending}
        style={{
          fontSize: 12, padding: '4px 10px',
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--fg)', cursor: 'pointer',
        }}
      >
        {isPending ? 'Sending…' : 'Test'}
      </button>
      {status.kind === 'success' && <span style={{ fontSize: 12, color: 'var(--ok)' }}>Delivered</span>}
      {status.kind === 'error' && <span style={{ fontSize: 12, color: 'var(--err)' }} title={status.message}>Failed</span>}
    </div>
  )
}
