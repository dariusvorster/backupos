'use client'

import { useState, useTransition } from 'react'
import { getAuditPage, getForensicTimeline, exportAuditLog, AuditEntry } from '@/app/actions/audit'

function fmtTs(d: Date): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
}

function actionColor(action: string): string {
  if (action.includes('deleted') || action.includes('revoked')) return 'var(--err)'
  if (action.includes('created') || action.includes('enrolled')) return 'var(--ok)'
  if (action.includes('updated') || action.includes('changed'))  return 'var(--warn)'
  return 'var(--fg-mute)'
}

interface IntegrityResult { ok: boolean; brokenAt?: string; checkedCount: number }

export function AuditClient({
  initialEntries, integrity,
}: {
  initialEntries: AuditEntry[]
  integrity:      IntegrityResult
}) {
  const [entries,       setEntries]       = useState<AuditEntry[]>(initialEntries)
  const [search,        setSearch]        = useState('')
  const [forensicActor, setForensicActor] = useState('')
  const [forensicMode,  setForensicMode]  = useState(false)
  const [isPending,     startTransition]  = useTransition()

  function runSearch() {
    startTransition(async () => {
      setEntries(await getAuditPage({ search: search || undefined }, 200))
      setForensicMode(false)
    })
  }

  function runForensic() {
    if (!forensicActor.trim()) return
    startTransition(async () => {
      setEntries(await getForensicTimeline(forensicActor.trim()))
      setForensicMode(true)
    })
  }

  function handleExport() {
    startTransition(async () => {
      const csv  = await exportAuditLog({ search: search || undefined }, 'csv')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'audit.csv' })
      a.click(); URL.revokeObjectURL(url)
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '7px 12px', fontSize: 13, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', outline: 'none',
  }
  const btnStyle: React.CSSProperties = {
    padding: '7px 14px', fontSize: 13, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)', background: 'var(--surf)', color: 'var(--fg-mute)', cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Audit log</h1>
        <button onClick={handleExport} style={btnStyle}>Export CSV</button>
      </div>

      {/* Chain integrity banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13,
        backgroundColor: integrity.ok ? '#0a2a0a' : '#2a0a0a',
        border: `1px solid ${integrity.ok ? 'var(--ok)' : 'var(--err)'}`,
      }}>
        <span style={{ color: integrity.ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>
          {integrity.ok ? '✓' : '✗'}
        </span>
        <span style={{ color: integrity.ok ? 'var(--ok)' : 'var(--err)' }}>
          Audit chain integrity: {integrity.ok
            ? `verified (${integrity.checkedCount} entr${integrity.checkedCount === 1 ? 'y' : 'ies'})`
            : `broken at entry ${integrity.brokenAt}`}
        </span>
      </div>

      {/* Search + forensic toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          placeholder="Search actions, resources, actors…"
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={runSearch} style={btnStyle}>Search</button>
        <input type="text" value={forensicActor} onChange={e => setForensicActor(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runForensic()}
          placeholder="Forensic: actor name…"
          style={{ ...inputStyle, width: 200, borderColor: forensicMode ? 'var(--warn)' : 'var(--border)', background: forensicMode ? '#1a1200' : 'var(--bg)' }} />
        <button onClick={runForensic}
          style={{ ...btnStyle, borderColor: forensicMode ? 'var(--warn)' : 'var(--border)', color: forensicMode ? 'var(--warn)' : 'var(--fg-mute)', background: forensicMode ? '#1a1200' : 'var(--surf)' }}>
          {forensicMode ? 'Forensic ✓' : 'Forensic mode'}
        </button>
      </div>

      {forensicMode && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: '#1a1200', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--warn)' }}>
          Full timeline for <strong>{forensicActor}</strong> — {entries.length} event{entries.length !== 1 ? 's' : ''}, oldest first
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            No audit events match your filters.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                {['Time', 'Action', 'Resource', 'Actor'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {fmtTs(entry.createdAt)}
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500,
                      color: actionColor(entry.action),
                      backgroundColor: actionColor(entry.action) + '22',
                    }}>{entry.action}</span>
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 13, color: 'var(--fg)' }}>
                    {entry.resourceName ?? entry.resourceId ?? '—'}
                    {' '}<span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>({entry.resourceType})</span>
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 13, color: 'var(--fg-mute)' }}>
                    {entry.actor ?? 'system'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {isPending && <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--fg-dim)' }}>Loading…</div>}
    </div>
  )
}
