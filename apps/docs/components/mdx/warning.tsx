import type { ReactNode } from 'react'

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div style={{
      backgroundColor: 'color-mix(in srgb, var(--err) 6%, var(--surf))',
      border: '1px solid color-mix(in srgb, var(--err) 25%, var(--border))',
      borderRadius: 'var(--radius)',
      padding: '12px 18px',
      margin: '16px 0',
      fontSize: 14,
      color: 'var(--fg)',
      lineHeight: 1.6,
    }}>
      <strong style={{
        display: 'block', marginBottom: 4,
        fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5,
        color: 'var(--err)',
      }}>Warning</strong>
      {children}
    </div>
  )
}
