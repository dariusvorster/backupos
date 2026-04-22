'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { syncMonitor } from '@/app/actions/monitors'

export function SyncButton({ monitorId }: { monitorId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await syncMonitor(monitorId)
      if (!result.ok) setError(result.error ?? 'Sync failed')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Button variant="primary" size="md" disabled={isPending} onClick={handleClick}>
        {isPending ? 'Syncing…' : 'Sync now'}
      </Button>
      {error && <span style={{ fontSize: 11, color: 'var(--err)' }}>{error}</span>}
    </div>
  )
}
