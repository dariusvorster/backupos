'use client'

import { useState } from 'react'
import type { HealthFactor } from '@/lib/health-score'

interface HealthScoreCardProps {
  score: number
  grade: string
  gradeColor: string
  factors: HealthFactor[]
  sparkline: number[]   // 30 values, oldest first, 0–100
}

function factorColor(score: number): string {
  if (score >= 75) return 'var(--ok)'
  if (score >= 50) return 'var(--warn)'
  return 'var(--err)'
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 120, H = 32
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - (v / max) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HealthScoreCard({
  score, grade, gradeColor, factors, sparkline,
}: HealthScoreCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hero card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
        style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 32, marginBottom: 32,
          outline: 'none',
        }}
      >
        {/* Big number + grade */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
          <span style={{
            fontSize: 64, fontWeight: 400, fontFamily: 'var(--font-mono)',
            color: gradeColor, lineHeight: 1,
          }}>
            {score}
          </span>
          <span style={{ fontSize: 32, fontWeight: 600, color: gradeColor }}>{grade}</span>
        </div>

        {/* Label + sparkline */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: 'var(--fg-mute)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Health score · last 30 days
          </div>
          <Sparkline data={sparkline} color={gradeColor} />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Click for breakdown
          </div>
        </div>

        {/* Factor mini-bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {factors.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 72, height: 4, borderRadius: 2,
                backgroundColor: 'var(--surf2)', flexShrink: 0, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${f.score}%`, height: '100%', borderRadius: 2,
                  backgroundColor: factorColor(f.score),
                }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 32, width: 480, maxWidth: '90vw',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>
                  Health score breakdown
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
                  Overall:{' '}
                  <span style={{
                    color: gradeColor,
                    fontFamily: 'var(--font-mono)', fontWeight: 600,
                  }}>
                    {score} ({grade})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--fg-mute)', fontSize: 20, lineHeight: 1, padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Factors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {factors.map(f => {
                const fc = factorColor(f.score)
                return (
                  <div key={f.label}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: 12, color: fc, fontFamily: 'var(--font-mono)' }}>
                        {f.value} · {f.score}%
                      </span>
                    </div>
                    <div style={{
                      height: 6, backgroundColor: 'var(--surf2)',
                      borderRadius: 3, overflow: 'hidden', marginBottom: 4,
                    }}>
                      <div style={{
                        width: `${f.score}%`, height: '100%',
                        backgroundColor: fc, borderRadius: 3,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {f.detail} · weight {f.weight}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
