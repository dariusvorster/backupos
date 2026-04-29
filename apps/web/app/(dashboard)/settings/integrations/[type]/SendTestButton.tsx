'use client'

import { useState, useTransition } from 'react'
import { sendTestAlert } from '@/app/actions/alerts'

export function SendTestButton({ channelId }: { channelId: string }) {
  const [isPending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        disabled={isPending}
        onClick={() => {
          setResult(null)
          start(async () => {
            const r = await sendTestAlert(channelId)
            setResult(r)
          })
        }}
        style={{
          padding: '4px 12px', fontSize: 12,
          cursor: isPending ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surf2)', color: 'var(--fg)',
        }}
      >
        {isPending ? 'Sending…' : 'Send test'}
      </button>
      {result && (
        <span style={{ fontSize: 12, color: result.ok ? 'var(--ok)' : 'var(--err)' }}>
          {result.ok ? 'Sent ✓' : `Failed: ${result.error}`}
        </span>
      )}
    </div>
  )
}
