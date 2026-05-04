'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncPbsDatastoreStats } from '@/app/actions/pbs-datastores'
import { Button } from '@/components/ui/button'

export function StatsRefreshButton({ id }: { id: string }) {
  const router = useRouter()
  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onRefresh() {
    setError(null)
    startTransition(async () => {
      const result = await syncPbsDatastoreStats(id)
      if (!result.ok) { setError(result.error ?? 'Unknown error'); return }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isPending}>
        {isPending ? 'Refreshing…' : 'Refresh stats'}
      </Button>
      {error && <span style={{ fontSize: 11, color: 'var(--err)' }}>✗ {error}</span>}
    </div>
  )
}
