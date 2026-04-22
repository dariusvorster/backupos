import type { ReactNode, CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
}

export function Card({ children, style }: CardProps) {
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ children, style }: CardProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border2)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--fg-dim)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
    }}>
      {children}
    </span>
  )
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--accent-deep)',
      textDecoration: 'none',
    }}>
      {children}
    </a>
  )
}

export function CardBody({ children, style }: CardProps) {
  return (
    <div style={{ padding: '12px 16px', ...style }}>
      {children}
    </div>
  )
}

export function CardFooter({ children, style }: CardProps) {
  return (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid var(--border2)',
      backgroundColor: 'var(--surf2)',
      ...style,
    }}>
      {children}
    </div>
  )
}
