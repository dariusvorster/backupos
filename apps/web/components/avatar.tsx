const PALETTE = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4',
] as const

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return ((parts[0]![0] || '') + (parts[parts.length - 1]![0] || '')).toUpperCase()
  }
  const result = name.slice(0, 2)
  return result.length > 0 ? result.toUpperCase() : 'U'
}

interface AvatarProps {
  name: string
  src?:  string | null
  size?: 24 | 32 | 48 | 80
}

export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const fontSize = size <= 24 ? 9 : size <= 32 ? 11 : size <= 48 ? 14 : 22

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      flexShrink: 0, overflow: 'hidden',
      backgroundColor: src ? 'transparent' : nameToColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize, fontWeight: 600, color: '#fff', lineHeight: 1, userSelect: 'none' }}>
          {initials(name)}
        </span>
      )}
    </div>
  )
}
