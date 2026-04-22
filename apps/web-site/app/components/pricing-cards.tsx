import type { CSSProperties } from 'react'

interface Tier {
  name: string
  price: string
  period: string
  badge?: string
  description: string
  cta: string
  ctaHref: string
  highlighted: boolean
  features: string[]
}

const tiers: Tier[] = [
  {
    name: 'Self-hosted',
    price: 'Free',
    period: 'forever',
    description: 'Run BackupOS on your own server. Full features, no limits, MIT licensed.',
    cta: 'Get started',
    ctaHref: '/#install',
    highlighted: false,
    features: [
      'Unlimited repositories',
      'Unlimited users',
      'All backup features',
      'Email alerts (your SMTP)',
      'Community support',
    ],
  },
  {
    name: 'Cloud Solo',
    price: '$9',
    period: '/ month',
    description: 'BackupOS Cloud for solo developers and hobbyists.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Solo waitlist',
    highlighted: false,
    features: [
      '1 user',
      '5 repositories',
      '100 GB bundled storage',
      'Email alerts included',
      'Managed agents',
      'Email support',
    ],
  },
  {
    name: 'Cloud Team',
    price: '$29',
    period: '/ month',
    badge: 'Most popular',
    description: 'For small teams and startups who need reliable, hassle-free backups.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Team waitlist',
    highlighted: true,
    features: [
      '5 users',
      '25 repositories',
      '500 GB bundled storage',
      'Email + webhook alerts',
      'Managed agents',
      'Priority email support',
      'Audit log export',
    ],
  },
  {
    name: 'Cloud Business',
    price: '$79',
    period: '/ month',
    description: 'Unlimited scale for teams that run critical infrastructure.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Business waitlist',
    highlighted: false,
    features: [
      'Unlimited users',
      'Unlimited repositories',
      '2 TB bundled storage',
      'All alert channels',
      'Managed agents + DR runbooks',
      'Slack / Teams support',
      'SSO (SAML)',
      'Custom retention policies',
    ],
  },
]

const check = '✓'

export function PricingCards() {
  const cardBase: CSSProperties = {
    background: 'var(--surf)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '28px 28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  }

  return (
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Simple, transparent pricing
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Self-host for free forever, or let us run it for you.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'start' }}>
          {tiers.map(t => (
            <div key={t.name} style={{
              ...cardBase,
              border: t.highlighted ? '2px solid var(--accent)' : '1px solid var(--border)',
              position: 'relative',
            }}>
              {t.badge && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap',
                }}>
                  {t.badge}
                </div>
              )}

              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 700 }}>{t.price}</span>
                <span style={{ fontSize: 13, color: 'var(--fg-dim)', marginLeft: 4 }}>{t.period}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6, marginBottom: 20 }}>{t.description}</p>

              <a href={t.ctaHref} style={{
                display: 'block', textAlign: 'center',
                padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-sm)',
                background: t.highlighted ? 'var(--accent)' : 'var(--surf2)',
                border: t.highlighted ? 'none' : '1px solid var(--border)',
                color: t.highlighted ? '#000' : 'var(--fg)',
                marginBottom: 24,
                textDecoration: 'none',
              }}>
                {t.cta}
              </a>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--fg-dim)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--ok)', flexShrink: 0 }}>{check}</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
