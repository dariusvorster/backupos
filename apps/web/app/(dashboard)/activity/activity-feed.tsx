'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import type { FeedItem, UpcomingItem } from './page'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtIn(d: Date): string {
  const ms = d.getTime() - Date.now()
  if (ms < 60_000) return 'soon'
  if (ms < 3_600_000) return `in ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `in ${Math.floor(ms / 3_600_000)}h`
  return `in ${Math.floor(ms / 86_400_000)}d`
}

function fmtRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60)         return `${sec}s ago`
  if (sec < 3_600)      return `${Math.floor(sec / 60)}m ago`
  if (sec < 86_400)     return `${Math.floor(sec / 3_600)}h ago`
  if (sec < 7 * 86_400) return `${Math.floor(sec / 86_400)}d ago`
  return fmtDate(d)
}

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--ok)',
  running: 'var(--accent)',
  failed:  'var(--err)',
  error:   'var(--err)',
  warning: 'var(--warn)',
  open:    'var(--warn)',
}

// ── Types ────────────────────────────────────────────────────────────────────

type Kind   = 'all' | 'run' | 'alert'
type Range  = '24h' | '7d' | '30d'
type Status = 'all' | 'success' | 'failed' | 'running' | 'warning' | 'open'

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  feed:     FeedItem[]
  upcoming: UpcomingItem[]
}

export function ActivityFeed({ feed, upcoming }: Props) {
  const [kind,      setKind]      = useState<Kind>('all')
  const [range,     setRange]     = useState<Range>('30d')
  const [status,    setStatus]    = useState<Status>('all')
  const [jobIds,    setJobIds]    = useState<Set<string>>(new Set())
  const [search,    setSearch]    = useState('')
  const [debounced, setDebounced] = useState('')
  const [jobsOpen,  setJobsOpen]  = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const jobOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of feed) {
      if (item.jobId && item.jobName) map.set(item.jobId, item.jobName)
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [feed])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    const ms = range === '24h' ? 24 * 3_600_000
             : range === '7d'  ? 7  * 86_400_000
                               : 30 * 86_400_000
    const cutoff = new Date(Date.now() - ms)

    return feed.filter(f => {
      if (kind !== 'all' && f.kind !== kind) return false
      if (status !== 'all' && f.status !== status) return false
      if (f.date < cutoff) return false
      if (jobIds.size > 0 && (!f.jobId || !jobIds.has(f.jobId))) return false
      if (q && !f.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [feed, kind, range, status, jobIds, debounced])

  function resetFilters() {
    setKind('all')
    setRange('30d')
    setStatus('all')
    setJobIds(new Set())
    setSearch('')
    setDebounced('')
  }

  function toggleJob(id: string) {
    setJobIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const pillBase: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surf2)',
    color: 'var(--fg-mute)',
  }
  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--fg)',
    fontWeight: 500,
  }

  return (
    <div>
      {/* ── Filter bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 0 10px',
        marginBottom: 16,
      }}>
        {/* Row 1: search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}>
            <input
              type="search"
              placeholder="Search activity…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 28px 6px 10px', fontSize: 13,
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1, padding: 0,
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Result count */}
          <span style={{ fontSize: 11, color: 'var(--fg-mute)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            Showing {filtered.length} of {feed.length} events
          </span>
        </div>

        {/* Row 2: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Kind toggle */}
          <div style={{ display: 'flex', gap: 2 }}>
            {(['all', 'run', 'alert'] as Kind[]).map(k => (
              <button key={k} onClick={() => setKind(k)}
                style={kind === k ? pillActive : pillBase}>
                {k === 'all' ? 'All' : k === 'run' ? 'Runs' : 'Alerts'}
              </button>
            ))}
          </div>

          {/* Range */}
          <select
            value={range}
            onChange={e => setRange(e.target.value as Range)}
            style={{ ...pillBase, paddingRight: 6 }}
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Status)}
            style={{ ...pillBase, paddingRight: 6 }}
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="warning">Warning</option>
            <option value="open">Open</option>
          </select>

          {/* Jobs multi-select */}
          {jobOptions.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setJobsOpen(o => !o)}
                style={jobIds.size > 0 ? pillActive : pillBase}
              >
                Jobs{jobIds.size > 0 ? ` (${jobIds.size})` : ''}
              </button>
              {jobsOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4,
                  backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '6px 0',
                  minWidth: 200, maxHeight: 240, overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,.12)',
                }}>
                  {jobOptions.map(j => (
                    <label key={j.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                      color: 'var(--fg)',
                    }}>
                      <input
                        type="checkbox"
                        checked={jobIds.has(j.id)}
                        onChange={() => toggleJob(j.id)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {j.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13,
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            No events match these filters.{' '}
            <button
              onClick={resetFilters}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, padding: 0 }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map(item => {
            const dotColor = STATUS_COLOR[item.status] ?? 'var(--fg-dim)'
            const cardStyle: React.CSSProperties = {
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 18px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--surf)',
              textDecoration: 'none',
              color: 'inherit',
            }
            const inner = (
              <>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  backgroundColor: dotColor, flexShrink: 0, marginTop: 3,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', wordBreak: 'break-word' }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 10,
                      border: '1px solid var(--border)',
                      color: item.kind === 'alert' ? 'var(--warn)' : 'var(--fg-dim)',
                      backgroundColor: 'var(--surf2)',
                    }}>
                      {item.kind}
                    </span>
                    <span
                      title={fmtDate(item.date)}
                      style={{ fontSize: 11, color: 'var(--fg-mute)' }}
                    >
                      {fmtRelative(item.date)}
                    </span>
                  </div>
                </div>
              </>
            )

            return item.href ? (
              <Link
                key={item.key}
                href={item.href}
                style={cardStyle}
                className="activity-card-link"
              >
                {inner}
              </Link>
            ) : (
              <div key={item.key} style={cardStyle}>
                {inner}
              </div>
            )
          })
        )}
      </div>

      {/* ── Upcoming section ── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Upcoming</div>
        {upcoming.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13,
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            No scheduled jobs queued.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(job => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--surf)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  backgroundColor: 'var(--accent)', flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{job.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 10,
                      border: '1px solid var(--border)', color: 'var(--accent)',
                      backgroundColor: 'var(--surf2)',
                    }}>
                      scheduled
                    </span>
                    {job.nextRunAt && (
                      <span style={{ fontSize: 11, color: 'var(--fg-mute)' }}>
                        {fmtDate(job.nextRunAt)} · {fmtIn(job.nextRunAt)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Hover style for clickable cards */}
      <style>{`
        .activity-card-link:hover { border-color: var(--accent) !important; }
      `}</style>
    </div>
  )
}
