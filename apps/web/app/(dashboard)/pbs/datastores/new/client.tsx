'use client'

import { useState, useTransition } from 'react'
import { createPbsDatastore }       from '@/app/actions/pbs-datastores'
import { Button }                   from '@/components/ui/button'

export function CreateDatastoreForm() {
  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createPbsDatastore(formData)
      if (result?.error) setError(result.error)
      // On success the server action calls redirect('/pbs') — we never reach here.
    })
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4,
  }

  return (
    <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="ds-name" style={labelStyle}>Name</label>
        <input
          id="ds-name"
          name="name"
          required
          autoFocus
          placeholder="default"
          pattern="[a-zA-Z0-9_-]{1,64}"
          disabled={isPending}
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4 }}>
          Letters, digits, dash, underscore. 1-64 chars. This is the name PVE uses in its
          datastore configuration. Cannot be changed later.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--err,#ef4444)', border: '1px solid var(--err,#ef4444)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create datastore'}
        </Button>
        <a href="/pbs" style={{ textDecoration: 'none' }}>
          <Button type="button" variant="ghost" disabled={isPending}>Cancel</Button>
        </a>
      </div>
    </form>
  )
}
