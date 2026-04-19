'use client'

import { useState, useTransition } from 'react'
import { deleteProfile, addRule, deleteRule } from '@/app/actions/bandwidth'
import { fmtLimit, build24hSparklineValues, UNLIMITED_KBPS, BandwidthRule } from '@/lib/bandwidth'

interface Rule {
  id:        string
  profileId: string
  startHour: number
  endHour:   number
  limitKbps: number | null
}

interface Profile {
  id:          string
  name:        string
  description: string | null
  isGlobal:    boolean | null
  createdAt:   Date
  rules:       Rule[]
}

interface Props {
  profiles: Profile[]
}

const HOURS = Array.from({ length: 25 }, (_, i) => i)

const inputSm: React.CSSProperties = {
  padding: '5px 8px', fontSize: 12,
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
}

function Sparkline({ rules }: { rules: BandwidthRule[] }) {
  const values = build24hSparklineValues(rules)
  const W = 168, H = 28, BAR_W = 6, GAP = 1
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {values.map((v, h) => {
        const barH = Math.max(3, Math.round((v / UNLIMITED_KBPS) * H))
        const x    = h * (BAR_W + GAP)
        const fill = v >= UNLIMITED_KBPS ? 'var(--ok)' : 'var(--warn)'
        return <rect key={h} x={x} y={H - barH} width={BAR_W} height={barH} fill={fill} opacity={0.75} rx={1} />
      })}
    </svg>
  )
}

function RuleEditor({ profileId, rules }: { profileId: string; rules: Rule[] }) {
  const [startHour, setStartHour] = useState('0')
  const [endHour,   setEndHour]   = useState('8')
  const [limitKbps, setLimitKbps] = useState('')
  const [, startTransition] = useTransition()

  async function handleAdd() {
    const fd = new FormData()
    fd.set('startHour', startHour)
    fd.set('endHour',   endHour)
    fd.set('limitKbps', limitKbps)
    await addRule(profileId, fd)
  }

  return (
    <div style={{ marginTop: 12 }}>
      {rules.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', textAlign: 'left' }}>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>Start</th>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>End</th>
              <th style={{ padding: '3px 8px', fontWeight: 500 }}>Limit</th>
              <th style={{ padding: '3px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{r.startHour}:00</td>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{r.endHour}:00</td>
                <td style={{ padding: '4px 8px', color: 'var(--fg)' }}>{fmtLimit(r.limitKbps)}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button
                    onClick={() => startTransition(() => { deleteRule(r.id) })}
                    style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={startHour} onChange={e => setStartHour(e.target.value)} style={{ ...inputSm, width: 68 }}>
          {HOURS.slice(0, 24).map(h => <option key={h} value={h}>{h}:00</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>to</span>
        <select value={endHour} onChange={e => setEndHour(e.target.value)} style={{ ...inputSm, width: 68 }}>
          {HOURS.slice(1).map(h => <option key={h} value={h}>{h}:00</option>)}
        </select>
        <input
          type="number"
          value={limitKbps}
          onChange={e => setLimitKbps(e.target.value)}
          placeholder="KB/s (blank = unlimited)"
          style={{ ...inputSm, width: 160 }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '5px 12px', fontSize: 12, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'none', color: 'var(--fg)',
          }}
        >
          Add rule
        </button>
      </div>
    </div>
  )
}

export function BandwidthProfileManager({ profiles }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (profiles.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '20px 0' }}>
        No bandwidth profiles yet. Create one above.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {profiles.map(p => (
        <div
          key={p.id}
          style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>{p.name}</span>
                {p.isGlobal && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--accent)',
                    border: '1px solid var(--accent)', borderRadius: 3,
                    padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Global default
                  </span>
                )}
              </div>
              {p.description && (
                <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>{p.description}</div>
              )}
            </div>
            <Sparkline rules={p.rules} />
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginLeft: 4 }}>
              {p.rules.length} rule{p.rules.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={e => {
                e.stopPropagation()
                startTransition(() => { deleteProfile(p.id) })
              }}
              style={{
                fontSize: 12, color: 'var(--fg-dim)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                padding: '3px 10px', cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
              {expanded === p.id ? '▲' : '▼'}
            </span>
          </div>

          {expanded === p.id && (
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: '14px 18px',
              backgroundColor: 'var(--surf2)',
            }}>
              <RuleEditor profileId={p.id} rules={p.rules} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
