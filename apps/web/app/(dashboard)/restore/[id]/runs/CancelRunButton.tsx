'use client'

import { useState, useTransition } from 'react'
import { cancelRestore } from '@/app/actions/restore'

export function CancelRunButton({ runId }: { runId: string }) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    if (!confirm('Cancel this restore? The running operation will be aborted.')) return
    startTransition(async () => {
      const result = await cancelRestore(runId)
      if (result.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMessage(result.error ?? 'Unknown error')
      }
    })
  }

  if (status === 'success') {
    return <span style={{ fontSize: 12, color: 'var(--ok)' }}>Cancel sent</span>
  }
  if (status === 'error') {
    return <span style={{ fontSize: 12, color: 'var(--err)' }} title={errorMessage}>Failed</span>
  }
  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={isPending}
      style={{
        fontSize: 12, padding: '4px 10px',
        backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', color: 'var(--fg)', cursor: 'pointer',
      }}
    >
      {isPending ? 'Cancelling…' : 'Cancel'}
    </button>
  )
}
