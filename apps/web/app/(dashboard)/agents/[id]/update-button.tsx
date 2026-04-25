'use client'

import { useState, useTransition } from 'react'
import { forceUpdateAgent } from '@/app/actions/agents'

export function UpdateAgentButton({ agentId }: { agentId: string }) {
  const [isPending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  function handleClick() {
    setResult(null)
    start(async () => {
      const r = await forceUpdateAgent(agentId)
      setResult(r)
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          padding: '6px 14px', fontSize: 13, cursor: isPending ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surf2)', color: 'var(--fg)', opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Sending…' : 'Update now'}
      </button>
      {result && (
        <span style={{ fontSize: 12, color: result.ok ? 'var(--ok)' : 'var(--err)' }}>
          {result.ok ? '✓ Update triggered — agent will restart shortly' : `✗ ${result.error}`}
        </span>
      )}
    </div>
  )
}
