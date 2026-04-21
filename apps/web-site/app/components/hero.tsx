const termLines = [
  { t: 'dim',    v: '$ restic snapshots' },
  { t: 'ok',     v: 'ID        Date       Host    Tags' },
  { t: 'normal', v: 'a1b2c3d4  2026-04-20  srv-01  daily' },
  { t: 'normal', v: 'e5f6g7h8  2026-04-19  srv-01  daily' },
  { t: 'accent', v: '✓  2 snapshots, 3.2 GB stored (saved 68%)' },
]

const colors: Record<string, string> = {
  dim:    'var(--fg-mute)',
  ok:     'var(--ok)',
  normal: 'var(--fg)',
  accent: 'var(--accent)',
}

export function Hero() {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center' }}>
      <div className="container">
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)',
          fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 24,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Open source · Self-hosted
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Restic backups,<br />
          <span style={{ color: 'var(--accent)' }}>without the ops burden</span>
        </h1>

        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--fg-dim)', maxWidth: 540, margin: '0 auto 36px', lineHeight: 1.65 }}>
          BackupOS wraps Restic with a web UI, job scheduler, email alerts, and repository health checks — so your backups actually run.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
          <a href="#install" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 600,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#000',
          }}>
            Install in 60 seconds
          </a>
          <a href="https://github.com/backupos/backupos" target="_blank" rel="noopener noreferrer" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            color: 'var(--fg)',
          }}>
            View on GitHub
          </a>
        </div>

        <div style={{
          maxWidth: 640, margin: '0 auto',
          background: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
          textAlign: 'left',
        }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {['#F56565','#F5A623','#3DD68C'].map(c => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
            ))}
          </div>
          <div style={{ padding: 20, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8 }}>
            {termLines.map((line, i) => (
              <div key={i} style={{ color: colors[line.t] }}>{line.v}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
