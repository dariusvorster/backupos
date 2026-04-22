'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { pruneRepository } from '@/app/actions/repositories'

interface PruneResult {
  removed: number
  kept: number
}

export function PruneButton({ repoId }: { repoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult]   = useState<PruneResult | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (result === null) return
    const id = setTimeout(() => setResult(null), 8000)
    return () => clearTimeout(id)
  }, [result])

  function handleClick() {
    setResult(null)
    setError(null)
    startTransition(async () => {
      const res = await pruneRepository(repoId)
      if (res.ok) {
        setResult({ removed: res.removed ?? 0, kept: res.kept ?? 0 })
      } else {
        setError(res.error ?? 'Prune failed')
      }
    })
  }

  const bannerText = result !== null
    ? result.removed === 0
      ? `Pruned: nothing to remove (${result.kept} kept)`
      : `Pruned: ${result.removed} snapshot${result.removed !== 1 ? 's' : ''} removed, ${result.kept} kept`
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Button variant="secondary" size="md" disabled={isPending} onClick={handleClick}>
        {isPending ? 'Pruning…' : 'Prune now'}
      </Button>
      {bannerText && (
        <span style={{ fontSize: 11, color: 'var(--ok)' }}>
          {bannerText}
        </span>
      )}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--err)' }}>
          Prune failed: {error}
        </span>
      )}
    </div>
  )
}
