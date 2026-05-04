import type { ReactNode } from 'react'

interface Props {
  message?: ReactNode
}

export function ViewOnlyBanner({ message }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 14px',
      marginBottom: 20,
      backgroundColor: 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 10%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 13,
      color: 'var(--fg-mute)',
    }}>
      <span style={{ fontSize: 14 }}>👁</span>
      <span>
        {message ?? "You're viewing this page in read-only mode. Admin role required to make changes."}
      </span>
    </div>
  )
}
