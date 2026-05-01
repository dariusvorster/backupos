'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PollWrapper({ initialStatus }: { initialStatus: string }) {
  const router = useRouter()

  useEffect(() => {
    if (initialStatus !== 'running') return
    const id = setInterval(() => { router.refresh() }, 3_000)
    return () => clearInterval(id)
  }, [initialStatus, router])

  return null
}
