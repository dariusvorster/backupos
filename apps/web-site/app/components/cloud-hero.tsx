export function CloudHero() {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center' }}>
      <div className="container">
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)',
          fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 24,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          BackupOS Cloud · Managed hosting
        </div>

        <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 62px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Backup management<br />
          <span style={{ color: 'var(--accent)' }}>without the server</span>
        </h1>

        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--fg-dim)', maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.65 }}>
          All of BackupOS — no VPS required. We run the agents and keep the lights on. You just add repositories and set a schedule.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 60 }}>
          <a href="mailto:cloud@backupos.dev?subject=Cloud waitlist" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 600,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#000',
            textDecoration: 'none',
          }}>
            Join the waitlist
          </a>
          <a href="/pricing/" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--fg)',
            textDecoration: 'none',
          }}>
            See pricing
          </a>
        </div>

        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { stat: '99.9%', label: 'uptime SLA' },
            { stat: 'EU & US', label: 'regions' },
            { stat: 'SOC 2', label: 'in progress' },
            { stat: '< 60 s', label: 'agent connect' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>{s.stat}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
