const features = [
  { icon: '🗓', title: 'Job scheduler',        body: 'CRON expressions with UI preview. Run on-demand or on schedule.' },
  { icon: '📬', title: 'Email alerts',          body: 'Configurable SMTP. Get notified on failure, success, or both.' },
  { icon: '🔍', title: 'Health checks',         body: 'Automated `restic check` jobs with pass/fail history.' },
  { icon: '🔐', title: 'Password escrow',       body: 'AES-256-GCM encrypted key storage with passphrase recovery.' },
  { icon: '✂️', title: 'Prune policies',        body: 'Keep N daily / weekly / monthly snapshots, applied per job.' },
  { icon: '📊', title: 'Dedup stats',           body: 'Per-repo size, raw size, and deduplication ratio at a glance.' },
  { icon: '🔄', title: 'Restore wizards',       body: 'Guided file, database, and full-host restore with DR runbooks.' },
  { icon: '📋', title: 'Audit log',             body: 'Immutable log of every backup run, check, and configuration change.' },
]

export function FeaturesGrid() {
  return (
    <section id="features" style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Everything Restic needs to be production-ready
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Built for self-hosters who treat their data seriously.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '24px 24px 20px',
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
