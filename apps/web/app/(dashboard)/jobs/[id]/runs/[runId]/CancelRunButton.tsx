'use client'

import { useState, useTransition } from 'react'
import { cancelJob } from '@/app/actions/jobs'

export function CancelRunButton({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    if (!confirm('Cancel this run? The running backup will be aborted.')) return
    startTransition(async () => {
      const result = await cancelJob(jobId)
      if (result.ok) {
        setStatus('success')
        if (result.error) setErrorMessage(result.error)
      } else {
        setStatus('error')
        setErrorMessage(result.error ?? 'Unknown error')
      }
    })
  }

  if (status === 'success') {
    return (
      <span
        style={{ fontSize: 12, color: 'var(--ok)' }}
        title={errorMessage || undefined}
      >
        Cancel sent
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span style={{ fontSize: 12, color: 'var(--err)' }} title={errorMessage}>
        Failed
      </span>
    )
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
