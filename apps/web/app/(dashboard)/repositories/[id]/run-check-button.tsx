'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { runCheck } from '@/app/actions/repositories'

export function RunCheckButton({ repoId }: { repoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<string | null>(null)

  function handleClick() {
    setStatus(null)
    startTransition(async () => {
      const result = await runCheck(repoId)
      setStatus(result.ok ? 'Check passed' : (result.error ?? 'Check failed'))
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Button variant="secondary" size="md" disabled={isPending} onClick={handleClick}>
        {isPending ? 'Checking…' : 'Run check'}
      </Button>
      {status && (
        <span style={{ fontSize: 11, color: status === 'Check passed' ? 'var(--ok)' : 'var(--err)' }}>
          {status}
        </span>
      )}
    </div>
  )
}
