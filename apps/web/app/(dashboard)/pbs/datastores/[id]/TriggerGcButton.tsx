'use client'

import { useState, useTransition } from 'react'
import { triggerPbsGc } from '@/app/actions/pbs-datastores'
import { Button } from '@/components/ui/button'

export function TriggerGcButton({ id }: { id: string }) {
  const [confirming, setConfirming]  = useState(false)
  const [result, setResult]          = useState<{ ok: boolean; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    setConfirming(false)
    setResult(null)
    startTransition(async () => {
      const r = await triggerPbsGc(id)
      if (r.ok) {
        setResult({ ok: true, message: r.taskId ? `GC started (task ${r.taskId.slice(0, 8)}…)` : 'GC started' })
      } else {
        setResult({ ok: false, message: r.error ?? 'Unknown error' })
      }
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {!confirming && (
        <Button variant="ghost" size="sm" onClick={() => { setConfirming(true); setResult(null) }} disabled={isPending}>
          {isPending ? 'Starting…' : 'Run GC now'}
        </Button>
      )}
      {confirming && (
        <>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            Run garbage collection? Rebuilds the chunk reference index.
          </span>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={isPending}>Confirm</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>Cancel</Button>
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
