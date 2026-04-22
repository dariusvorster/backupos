const features = [
  {
    icon: '🤖',
    title: 'Managed agents',
    body: 'We deploy and maintain Restic agents for you. No SSH keys, no cron tabs, no server provisioning.',
  },
  {
    icon: '💾',
    title: 'Storage included',
    body: 'S3-compatible object storage bundled with every plan. Bring your own bucket or use ours.',
  },
  {
    icon: '🔄',
    title: 'Automatic updates',
    body: 'BackupOS and Restic are kept up-to-date automatically — zero-downtime rolling upgrades.',
  },
  {
    icon: '🌍',
    title: 'Multi-region',
    body: 'Choose EU (Frankfurt) or US (Virginia) for your control plane and storage. GDPR-ready.',
  },
  {
    icon: '🛡',
    title: 'End-to-end encryption',
    body: 'All repository passwords are encrypted client-side. We never see your data keys.',
  },
  {
    icon: '👥',
    title: 'Team access',
    body: 'Invite team members, assign repository permissions, and share runbooks across your org.',
  },
]

export function CloudFeatures() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Everything managed for you
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Focus on your applications. We keep your backups running.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
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
