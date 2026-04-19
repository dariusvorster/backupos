'use client'

import { useState, useTransition } from 'react'
import { getLogsPage, exportLogs, LogEntry, LogFilters } from '@/app/actions/logs'

const LEVEL_COLORS: Record<string, string> = {
  debug: 'var(--fg-dim)',
  info:  'var(--ok)',
  warn:  'var(--warn)',
  error: 'var(--err)',
  fatal: 'var(--err)',
}
const COMPONENTS = ['web', 'agent', 'engine', 'hypervisor', 'hook', 'monitor']
const LEVELS     = ['debug', 'info', 'warn', 'error', 'fatal']

function fmtTs(d: Date): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
}

export function LogsClient({ initialLogs }: { initialLogs: LogEntry[] }) {
  const [logs,      setLogs]      = useState<LogEntry[]>(initialLogs)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [component, setComponent] = useState('')
  const [level,     setLevel]     = useState('')
  const [search,    setSearch]    = useState('')
  const [isPending, startTransition] = useTransition()

  function refetch(overrides: Partial<LogFilters> = {}) {
    const filters: LogFilters = {
      component: overrides.component !== undefined ? overrides.component || undefined : component || undefined,
      level:     overrides.level     !== undefined ? overrides.level     || undefined : level     || undefined,
      search:    overrides.search    !== undefined ? overrides.search    || undefined : search    || undefined,
    }
    startTransition(async () => {
      const results = await getLogsPage(filters, 200)
      setLogs(results)
    })
  }

  function handleExport() {
    startTransition(async () => {
      const csv  = await exportLogs({ component: component || undefined, level: level || undefined, search: search || undefined }, 'csv')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: 'logs.csv' })
      a.click(); URL.revokeObjectURL(url)
    })
  }

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <span key={label} onClick={onClick} style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
      fontSize: 12, fontFamily: 'var(--font-mono)',
      backgroundColor: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--fg-mute)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    }}>{label}</span>
  )

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Filter rail */}
      <aside style={{
        width: 220, minWidth: 220, flexShrink: 0, padding: '16px 12px',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Component</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {COMPONENTS.map(c => chip(c, component === c, () => {
              const next = component === c ? '' : c
              setComponent(next)
              refetch({ component: next })
            }))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Level</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {LEVELS.map(l => chip(l, level === l, () => {
              const next = level === l ? '' : l
              setLevel(next)
              refetch({ level: next })
            }))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Search</div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && refetch()} placeholder="Filter messages…"
            style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', outline: 'none' }}
          />
        </div>
      </aside>

      {/* Log stream */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>
            Operational logs
            {isPending && <span style={{ fontSize: 13, color: 'var(--fg-dim)', marginLeft: 12 }}>Loading…</span>}
          </h1>
          <button onClick={handleExport} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surf)', color: 'var(--fg-mute)', cursor: 'pointer' }}>
            Export CSV
          </button>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            No log entries match the current filters.
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1 }}>
            {logs.map(entry => (
              <div key={entry.id}>
                <div onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 152 }}>{fmtTs(entry.createdAt)}</span>
                  <span style={{ color: LEVEL_COLORS[entry.level] ?? 'var(--fg)', fontWeight: 600, width: 44, flexShrink: 0 }}>
                    {entry.level.toUpperCase().slice(0, 4)}
                  </span>
                  <span style={{ color: 'var(--fg-mute)', width: 80, flexShrink: 0 }}>{entry.component}</span>
                  <span style={{ color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.message}</span>
                  {entry.payload && <span style={{ color: 'var(--fg-dim)', flexShrink: 0 }}>⋯</span>}
                </div>
                {expanded === entry.id && entry.payload && (
                  <pre style={{ margin: 0, padding: '8px 20px 8px 280px', backgroundColor: 'var(--bg2)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-mute)', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                    {(() => { try { return JSON.stringify(JSON.parse(entry.payload), null, 2) } catch { return entry.payload } })()}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
