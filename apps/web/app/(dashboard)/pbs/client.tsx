'use client'

import { useState } from 'react'

export interface DatastoreRow {
  id:              string
  name:            string
  path:            string
  createdAt:       string
  pruneSchedule:   string | null
  gcSchedule:      string | null
  lastGcAt:        string | null
  totalSizeBytes:  number | null
  uniqueSizeBytes: number | null
}

function bytesToHuman(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export function DatastoreList({ initialDatastores }: { initialDatastores: DatastoreRow[] }) {
  const [datastores] = useState(initialDatastores)

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: 12,
    color: 'var(--fg-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = {
    padding: '10px', color: 'var(--fg)', borderBottom: '1px solid var(--border)',
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Path</th>
            <th style={th}>Size</th>
            <th style={th}>GC schedule</th>
            <th style={th}>Last GC</th>
            <th style={{ ...th, width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {datastores.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--fg-dim)', padding: 32 }}>
                No datastores yet
              </td>
            </tr>
          ) : (
            datastores.map(d => (
              <tr key={d.id}>
                <td style={td}>
                  <a
                    href={`/pbs/datastores/${d.id}`}
                    style={{ color: 'var(--fg)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  >
                    {d.name}
                  </a>
                </td>
                <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}><code>{d.path}</code></td>
                <td style={{ ...td, color: 'var(--fg-dim)' }}>{bytesToHuman(d.totalSizeBytes)}</td>
                <td style={{ ...td, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {d.gcSchedule ?? '—'}
                </td>
                <td style={{ ...td, color: 'var(--fg-dim)' }}>
                  {d.lastGcAt ? new Date(d.lastGcAt).toLocaleString() : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <a
                    href={`/pbs/datastores/${d.id}`}
                    style={{ fontSize: 12, color: 'var(--fg-dim)', textDecoration: 'none' }}
                  >
                    →
                  </a>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
