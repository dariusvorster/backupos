'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { runSpec } from '@/app/actions/restore'

export function RunNowButton({ specId }: { specId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="primary"
      size="md"
      disabled={isPending}
      onClick={() => startTransition(() => runSpec(specId))}
    >
      {isPending ? 'Starting…' : 'Run now'}
    </Button>
  )
}
