'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { runVerification } from '@/app/actions/verification'

export function RunVerificationButton({ testId }: { testId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="primary"
      size="md"
      disabled={isPending}
      onClick={() => startTransition(() => runVerification(testId))}
    >
      {isPending ? 'Starting…' : 'Run now'}
    </Button>
  )
}
