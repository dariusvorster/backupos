type BadgeStatus =
  | 'healthy' | 'success' | 'connected' | 'online'
  | 'running'
  | 'warning' | 'missed'
  | 'failed' | 'error' | 'disconnected' | 'offline'
  | 'idle' | 'paused'
  | 'verifying'

interface StyleEntry { bg: string; color: string; pulse?: boolean }

const MAP: Record<BadgeStatus, StyleEntry> = {
  healthy:      { bg: 'var(--ok-dim)',     color: 'var(--ok)' },
  success:      { bg: 'var(--ok-dim)',     color: 'var(--ok)' },
  connected:    { bg: 'var(--ok-dim)',     color: 'var(--ok)' },
  online:       { bg: 'var(--ok-dim)',     color: 'var(--ok)' },
  running:      { bg: 'var(--info-dim)',   color: 'var(--info)', pulse: true },
  warning:      { bg: 'var(--warn-dim)',   color: 'var(--warn)' },
  missed:       { bg: 'var(--warn-dim)',   color: 'var(--warn)' },
  failed:       { bg: 'var(--err-dim)',    color: 'var(--err)' },
  error:        { bg: 'var(--err-dim)',    color: 'var(--err)' },
  disconnected: { bg: 'var(--err-dim)',    color: 'var(--err)' },
  offline:      { bg: 'var(--err-dim)',    color: 'var(--err)' },
  idle:         { bg: 'var(--surf2)',      color: 'var(--fg-mute)' },
  paused:       { bg: 'var(--surf2)',      color: 'var(--fg-mute)' },
  verifying:    { bg: 'var(--accent-dim)', color: 'var(--accent)' },
}

interface BadgeProps {
  status: BadgeStatus
  label?: string
}

export function Badge({ status, label }: BadgeProps) {
  const s = MAP[status]
  const text = label ?? status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 500,
      backgroundColor: s.bg, color: s.color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        backgroundColor: s.color, flexShrink: 0,
        animation: s.pulse ? 'pulse-dot 1s ease-in-out infinite' : undefined,
      }} />
      {text}
    </span>
  )
}
