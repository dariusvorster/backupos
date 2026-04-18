import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  delta?: { text: string; direction: 'up' | 'down' | 'neutral' }
  footer?: string
}

export function StatCard({ label, value, delta, footer }: StatCardProps) {
  const deltaColor = delta?.direction === 'up'
    ? 'var(--ok)'
    : delta?.direction === 'down'
    ? 'var(--err)'
    : 'var(--fg-mute)'
  const deltaGlyph = delta?.direction === 'up' ? '↑' : delta?.direction === 'down' ? '↓' : ''

  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 500,
        color: 'var(--fg-mute)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 400,
        color: 'var(--fg)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.25,
        marginBottom: delta || footer ? 6 : 0,
      }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 11, color: deltaColor }}>
          {deltaGlyph} {delta.text}
        </div>
      )}
      {footer && !delta && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{footer}</div>
      )}
    </div>
  )
}
