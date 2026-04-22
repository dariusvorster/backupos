const faqs = [
  {
    q: 'Can I migrate from self-hosted to cloud?',
    a: 'Yes. BackupOS Cloud uses the same Restic repository format. Export your repos, point them at your cloud workspace, and your snapshot history is intact.',
  },
  {
    q: 'What counts as "bundled storage"?',
    a: 'Bundled storage is the compressed, deduplicated data stored in your BackupOS-managed object bucket. You can also bring your own S3-compatible bucket at no extra cost.',
  },
  {
    q: 'Is the self-hosted version truly unlimited?',
    a: 'Yes — MIT license, no call-home, no feature flags. Repositories, users, and retention policies are all uncapped.',
  },
  {
    q: 'Can I cancel my cloud plan anytime?',
    a: 'Yes. Cancel with one click and export all your data within 30 days. No lock-in.',
  },
  {
    q: 'Do cloud plans include the DR restore wizards?',
    a: 'Yes. File, database, and full-host restore wizards are available on all cloud tiers.',
  },
  {
    q: 'How is repository password security handled on cloud?',
    a: 'Repository passwords are encrypted client-side with AES-256-GCM before being stored. BackupOS Cloud never sees your plaintext keys.',
  },
]

export function PricingFaq() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 700, textAlign: 'center', marginBottom: 48 }}>
          Frequently asked questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {faqs.map((faq, i) => (
            <div key={faq.q} style={{
              padding: '24px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{faq.q}</div>
              <div style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.7 }}>{faq.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
