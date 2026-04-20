export function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

export function DedupBar({
  stored,
  raw,
}: {
  stored: number | null
  raw:    number | null
}) {
  if (!stored) {
    return <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>—</span>
  }

  if (!raw || raw <= stored) {
    return (
      <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
        {fmtBytes(stored)}
      </span>
    )
  }

  const storedPct  = Math.round((stored / raw) * 100)
  const savingsPct = 100 - storedPct

  return (
    <div style={{ display: 'inline-block', textAlign: 'right' }}>
      <div style={{
        display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden',
        width: 80, background: 'var(--border)', marginLeft: 'auto',
      }}>
        <div
          style={{ width: `${storedPct}%`, background: 'var(--accent)' }}
          title={`Stored: ${fmtBytes(stored)}`}
        />
        <div
          style={{ width: `${savingsPct}%`, background: '#22c55e' }}
          title={`Savings: ${fmtBytes(raw - stored)}`}
        />
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
        {fmtBytes(stored)} · {savingsPct}% saved
      </div>
    </div>
  )
}
