'use client'

import { useState, useCallback } from 'react'
import type { PhaseData, PhaseEntry } from '@/app/actions/runs'

interface PhaseTimelineProps {
  phases:   PhaseData
  totalMs:  number
  onScrub?: (fraction: number) => void
}

const PHASE_ORDER = ['preHook', 'backup', 'postHook', 'verification'] as const
type PhaseName = typeof PHASE_ORDER[number]

const PHASE_LABEL: Record<PhaseName, string> = {
  preHook:      'Pre-hook',
  backup:       'Backup',
  postHook:     'Post-hook',
  verification: 'Verify',
}

const PHASE_COLOR: Record<string, string> = {
  ok:      'var(--ok)',
  error:   'var(--err)',
  skipped: 'var(--fg-dim)',
}

export function PhaseTimeline({ phases, totalMs, onScrub }: PhaseTimelineProps) {
  const [scrubPos, setScrubPos] = useState(100)

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setScrubPos(val)
    onScrub?.(val / 100)
  }, [onScrub])

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Phase bars */}
      <div style={{ position: 'relative', height: 24, backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 6 }}>
        {PHASE_ORDER.map(name => {
          const phase = phases[name] as PhaseEntry | undefined
          if (!phase) return null
          const left  = totalMs > 0 ? (phase.startMs / totalMs) * 100 : 0
          const width = totalMs > 0 ? (phase.durationMs / totalMs) * 100 : 0
          const color = PHASE_COLOR[phase.status] ?? 'var(--accent)'
          return (
            <div
              key={name}
              title={`${PHASE_LABEL[name]}: ${(phase.durationMs / 1000).toFixed(1)}s (${phase.status})`}
              style={{
                position: 'absolute', left: `${left}%`, width: `${width}%`,
                height: '100%', backgroundColor: color, opacity: 0.75,
              }}
            />
          )
        })}
        <div style={{
          position: 'absolute', left: `${scrubPos}%`, top: 0, bottom: 0,
          width: 2, backgroundColor: 'var(--fg)', pointerEvents: 'none', transform: 'translateX(-50%)',
        }} />
      </div>

      {/* Phase labels */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {PHASE_ORDER.map(name => {
          const phase = phases[name] as PhaseEntry | undefined
          if (!phase) return null
          const color = PHASE_COLOR[phase.status] ?? 'var(--accent)'
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--fg-mute)' }}>{PHASE_LABEL[name]}</span>
              <span style={{ color: 'var(--fg-dim)' }}>{(phase.durationMs / 1000).toFixed(1)}s</span>
            </div>
          )
        })}
      </div>

      {/* Scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', minWidth: 32 }}>0s</span>
        <input
          type="range" min={0} max={100} value={scrubPos}
          onChange={handleScrub}
          style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', minWidth: 40, textAlign: 'right' }}>
          {(totalMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
