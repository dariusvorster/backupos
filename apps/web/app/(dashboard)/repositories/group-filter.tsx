'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function GroupFilter({ groups }: { groups: string[] }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const current      = searchParams.get('group') ?? ''

  if (groups.length === 0) return null

  const pick = (g: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (g) params.set('group', g)
    else    params.delete('group')
    router.push(`/repositories?${params.toString()}`)
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', fontSize: 12, fontWeight: 500,
    borderRadius: 9999, border: '1px solid var(--border)',
    background:   active ? 'var(--accent)'  : 'var(--surf2)',
    color:        active ? '#fff'           : 'var(--fg-mute)',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      <button style={chipStyle(current === '')} onClick={() => pick('')}>All</button>
      {groups.map(g => (
        <button key={g} style={chipStyle(current === g)} onClick={() => pick(g)}>
          {g}
        </button>
      ))}
    </div>
  )
}
