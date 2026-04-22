import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  action?: ReactNode
  description?: string
}

export function PageHeader({ title, action, description }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: description ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: 12,
    }}>
      <div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--fg)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '4px 0 0' }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
