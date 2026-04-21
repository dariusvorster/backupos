const oses = [
  { name: 'Linux', icon: '🐧' },
  { name: 'macOS', icon: '🍎' },
  { name: 'Windows', icon: '🪟', note: 'via Docker' },
  { name: 'ARM / RPi', icon: '🦾' },
  { name: 'NAS / Synology', icon: '💾', note: 'via Docker' },
]

export function OsFamily() {
  return (
    <section style={{ padding: '40px 0 80px' }}>
      <div className="container">
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13, marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Runs on
        </p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {oses.map(o => (
            <div key={o.name} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{o.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
              {o.note && <div style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{o.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
