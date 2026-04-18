import type { ReactNode } from 'react'
import Link from 'next/link'

interface Action {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  type: 'page' | 'inline' | 'filtered'
  icon?: ReactNode
  headline: string
  description?: string
  primaryAction?: Action
  secondaryAction?: Action
  query?: string
}

export function EmptyState({
  type, icon, headline, description, primaryAction, secondaryAction, query,
}: EmptyStateProps) {
  if (type === 'filtered') {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 12 }}>
          {query
            ? <>No results for <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{query}</code></>
            : headline}
        </p>
        {primaryAction && <ActionEl action={primaryAction} variant="ghost" />}
      </div>
    )
  }

  if (type === 'inline') {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        {icon && (
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--fg-dim)', marginBottom: 12 }}>
            {icon}
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 8 }}>{headline}</p>
        {primaryAction && <ActionEl action={primaryAction} variant="ghost" />}
      </div>
    )
  }

  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      {icon && (
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--fg-dim)', marginBottom: 20 }}>
          {icon}
        </div>
      )}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>{headline}</h2>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.6, marginBottom: 24 }}>{description}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {primaryAction   && <ActionEl action={primaryAction}   variant="primary" />}
          {secondaryAction && <ActionEl action={secondaryAction} variant="ghost"   />}
        </div>
      )}
    </div>
  )
}

function ActionEl({ action, variant }: { action: Action; variant: 'primary' | 'ghost' }) {
  const style = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: '36px', padding: '0 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px', fontWeight: 500,
    textDecoration: 'none',
    backgroundColor: variant === 'primary' ? 'var(--accent)' : 'transparent',
    color: variant === 'primary' ? 'var(--accent-fg)' : 'var(--accent)',
    border: 'none', cursor: 'pointer',
  } as const
  if (action.href) return <Link href={action.href} style={style}>{action.label}</Link>
  return <button onClick={action.onClick} style={style}>{action.label}</button>
}
