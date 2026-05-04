'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteVerificationTest } from '@/app/actions/verification'

interface Props {
  id:   string
  name: string
}

export function DeleteTestButton({ id, name }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    if (!confirm(
      `Delete verification test "${name}"?\n\n` +
      `This permanently removes the test and all its run history. ` +
      `This cannot be undone.`,
    )) return
    startTransition(async () => {
      const result = await deleteVerificationTest(id)
      if (result.error) {
        alert(`Delete failed: ${result.error}`)
        return
      }
      router.push('/verification')
    })
  }

  return (
    <Button variant="ghost" size="md" onClick={onDelete} disabled={isPending}>
      {isPending ? 'Deleting…' : 'Delete'}
    </Button>
  )
}
