'use client'

import { useState, useTransition } from 'react'
import { deleteHypervisorIntegration } from '@/app/actions/hypervisors'

export function DeleteHypervisorButton({
  integrationId,
  integrationName,
  targetCount,
}: {
  integrationId:   string
  integrationName: string
  targetCount:     number
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, start]          = useTransition()

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          padding: '6px 14px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, var(--err) 40%)',
          background: 'var(--surf2)', color: 'var(--err)',
        }}
      >
        Delete
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      backgroundColor: 'var(--err-dim)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid color-mix(in srgb, var(--border) 50%, var(--err) 50%)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--err)' }}>
        Delete <strong>{integrationName}</strong> and its {targetCount} target
        {targetCount === 1 ? '' : 's'}? Backup jobs referencing them will fail until reconfigured.
      </span>
      <button
        disabled={isPending}
        onClick={() => { start(async () => { await deleteHypervisorIntegration(integrationId) }) }}
        style={{
          padding: '4px 12px', fontSize: 12, fontWeight: 600,
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--err)', color: '#fff',
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Deleting…' : 'Confirm'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        style={{
          padding: '4px 10px', fontSize: 12,
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'var(--surf2)', color: 'var(--fg-mute)', cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
