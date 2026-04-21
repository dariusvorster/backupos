const pains = [
  { icon: '🔕', title: 'Silent failures',    body: 'Cron jobs fail, no one notices. Data is gone when you need it most.' },
  { icon: '🗂', title: 'Repo sprawl',         body: 'Dozens of Restic repos across machines with no central view of health or size.' },
  { icon: '⏱', title: 'Manual scheduling',   body: 'Writing cron syntax and prune policies by hand for every new repo.' },
  { icon: '🔑', title: 'Key management',      body: 'Repository passwords stored in plaintext scripts or forgotten entirely.' },
]

export function Problem() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Restic is great. <span style={{ color: 'var(--fg-dim)' }}>Managing it isn't.</span>
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52, fontSize: 16 }}>
          Four problems that bite every self-hoster eventually.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {pains.map(p => (
            <div key={p.title} style={{
              background: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 28,
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{p.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{p.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
