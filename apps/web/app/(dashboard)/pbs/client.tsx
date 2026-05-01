'use client'

import { useState, useTransition } from 'react'
import { deletePbsDatastore }       from '@/app/actions/pbs-datastores'
import { Button }                   from '@/components/ui/button'

export interface DatastoreRow {
  id:        string
  name:      string
  path:      string
  createdAt: string
}

export function DatastoreList({ initialDatastores }: { initialDatastores: DatastoreRow[] }) {
  const [datastores, setDatastores]  = useState(initialDatastores)
  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string, name: string) {
    if (!confirm(
      `Delete datastore "${name}"?\n\n` +
      `This permanently removes all chunks and snapshots stored here. ` +
      `PVE clusters configured to back up to this datastore will fail their next backup.\n\n` +
      `This cannot be undone.`,
    )) return
    setError(null)
    startTransition(async () => {
      const result = await deletePbsDatastore(id)
      if (result.error) { setError(result.error); return }
      setDatastores(ds => ds.filter(d => d.id !== id))
    })
  }

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: 12,
    color: 'var(--fg-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = {
    padding: '10px', color: 'var(--fg)', borderBottom: '1px solid var(--border)',
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', fontSize: 13, color: 'var(--err,#ef4444)', border: '1px solid var(--err,#ef4444)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Path</th>
              <th style={th}>Created</th>
              <th style={{ ...th, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {datastores.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--fg-dim)', padding: 32 }}>
                  No datastores yet
                </td>
              </tr>
            ) : (
              datastores.map(d => (
                <tr key={d.id}>
                  <td style={td}><code style={{ fontSize: 12 }}>{d.name}</code></td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}><code>{d.path}</code></td>
                  <td style={{ ...td, color: 'var(--fg-dim)' }}>{new Date(d.createdAt).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(d.id, d.name)}
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
