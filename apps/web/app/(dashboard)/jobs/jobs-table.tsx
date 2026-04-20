'use client'

import { useState, useTransition }     from 'react'
import Link                            from 'next/link'
import type { ComponentProps }         from 'react'
import { Badge }                       from '@/components/ui/badge'
import { pauseJobs, resumeJobs, deleteJobs } from '@/app/actions/jobs'
import type { RunDot }                 from './page'

type BadgeStatus = ComponentProps<typeof Badge>['status']

interface Job {
  id:             string
  name:           string
  schedule:       string
  enabled:        boolean | null
  lastRunAt:      Date | null
  lastRunStatus:  string | null
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function RunStrip({ dots }: { dots: RunDot[] }) {
  const color: Record<RunDot, string> = {
    success: '#22c55e',
    failed:  '#ef4444',
    none:    '#e5e7eb',
  }
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {dots.map((d, i) => (
        <span
          key={i}
          title={d}
          style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', backgroundColor: color[d],
          }}
        />
      ))}
    </div>
  )
}

export function JobsTable({
  jobs,
  strips,
}: {
  jobs:   Job[]
  strips: Record<string, RunDot[]>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending,  startTransition] = useTransition()

  const toggleAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(jobs.map(j => j.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAction = (action: 'pause' | 'resume' | 'delete') => {
    const ids = [...selected]
    if (!ids.length) return
    if (action === 'delete' && !confirm(`Delete ${ids.length} job(s)? This also deletes their run history.`)) return
    startTransition(async () => {
      if (action === 'pause')  await pauseJobs(ids)
      if (action === 'resume') await resumeJobs(ids)
      if (action === 'delete') await deleteJobs(ids)
      setSelected(new Set())
    })
  }

  const th: React.CSSProperties = {
    padding: '10px 16px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 16px', fontSize: 13, color: 'var(--fg)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Jobs</h1>
        <Link
          href="/jobs/new"
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#fff', textDecoration: 'none',
          }}
        >
          New job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)', fontSize: 13,
        }}>
          No jobs yet.{' '}
          <Link href="/jobs/new" style={{ color: 'var(--accent)' }}>Create your first job →</Link>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={{ ...th, width: 40, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === jobs.length && jobs.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={th}>Name</th>
                <th style={th}>Schedule</th>
                <th style={th}>Status</th>
                <th style={th}>Last run</th>
                <th style={th}>Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} style={{ opacity: pending ? 0.6 : 1 }}>
                  <td style={{ ...td, width: 40, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(job.id)}
                      onChange={() => toggleOne(job.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={td}>
                    <Link href={`/jobs/${job.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                      {job.name}
                    </Link>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {job.schedule}
                  </td>
                  <td style={td}>
                    <Badge status={job.enabled === true ? 'healthy' : 'paused'} label={job.enabled === true ? 'Enabled' : 'Disabled'} />
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {fmtDate(job.lastRunAt)}
                  </td>
                  <td style={td}>
                    <RunStrip dots={strips[job.id] ?? Array(7).fill('none')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '10px 16px',
          display: 'flex', gap: 8, alignItems: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 40,
        }}>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)', marginRight: 4 }}>
            {selected.size} selected
          </span>
          {[
            { label: 'Pause',  action: 'pause'  as const, color: 'var(--fg)'  },
            { label: 'Resume', action: 'resume' as const, color: 'var(--fg)'  },
            { label: 'Delete', action: 'delete' as const, color: 'var(--err)' },
          ].map(({ label, action, color }) => (
            <button
              key={action}
              disabled={pending}
              onClick={() => handleBulkAction(action)}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 500,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surf2)', color, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '5px 10px', fontSize: 12,
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
