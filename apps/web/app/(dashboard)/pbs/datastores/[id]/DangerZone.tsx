'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePbsDatastore } from '@/app/actions/pbs-datastores'
import { Button } from '@/components/ui/button'

interface Props {
  id:   string
  name: string
}

export function DangerZone({ id, name }: Props) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  const matches = confirmText === name

  function onDelete() {
    if (!matches) return
    setError(null)
    startTransition(async () => {
      const r = await deletePbsDatastore(id)
      if (r.error) { setError(r.error); return }
      router.push('/pbs')
    })
  }

  return (
    <section style={{ padding: 20, border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)' }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--err)', marginTop: 0, marginBottom: 8 }}>Danger zone</h2>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 0, marginBottom: 16 }}>
        Deleting a datastore permanently removes all chunks and snapshots stored in it. PVE clusters
        configured to back up to this datastore will fail their next backup. This cannot be undone.
      </p>
      <p style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 8 }}>
        Type the datastore name (<code>{name}</code>) to confirm:
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={name}
        disabled={isPending}
        style={{
          display: 'block', width: '100%', padding: '6px 10px', fontSize: 13,
          fontFamily: 'var(--font-mono)',
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
          boxSizing: 'border-box', marginBottom: 12,
        }}
      />
      {error && (
        <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--err)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
          {error}
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={!matches || isPending}>
        {isPending ? 'Deleting…' : 'Delete datastore'}
      </Button>
    </section>
  )
}
