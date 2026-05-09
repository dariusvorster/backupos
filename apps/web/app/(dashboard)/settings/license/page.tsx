import { getLicenseSummary } from '@/app/actions/license'
import { getTierConfig } from '@backupos/license-client'
import { LicenseClient } from './client'

export default async function LicensePage() {
  const { tier, licenseKey, expiresAt } = await getLicenseSummary()
  const cfg = getTierConfig(tier)

  const limits = [
    { label: 'Agents',         value: cfg.limits.agents        === -1 ? 'Unlimited' : cfg.limits.agents },
    { label: 'Repositories',   value: cfg.limits.repositories   === -1 ? 'Unlimited' : cfg.limits.repositories },
    { label: 'Operators',      value: cfg.limits.operators      === -1 ? 'Unlimited' : cfg.limits.operators },
    { label: 'Alert channels', value: cfg.limits.alertChannels  === -1 ? 'Unlimited' : cfg.limits.alertChannels },
    { label: 'API tokens',     value: cfg.limits.apiTokens      === -1 ? 'Unlimited' : cfg.limits.apiTokens },
    { label: 'Retention',      value: cfg.limits.retentionDays  === -1 ? 'Unlimited' : `${cfg.limits.retentionDays} days` },
  ]

  const features = cfg.features.length > 0 ? cfg.features : ['None on this tier']

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>License</h1>

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', marginBottom: 16,
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Active plan
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{
              fontSize: 20, fontWeight: 700, textTransform: 'capitalize', color: 'var(--fg)',
            }}>{tier}</span>
            {expiresAt && (
              <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
                expires {expiresAt.toLocaleDateString()}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 20 }}>
            {limits.map(l => (
              <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ color: 'var(--fg-mute)' }}>{l.label}</span>
                <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{l.value}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 4 }}>Features</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {features.map(f => (
              <span key={f} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                backgroundColor: 'var(--accent-dim)', color: 'var(--accent-deep)',
                textTransform: 'capitalize',
              }}>{f.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      </div>

      <LicenseClient currentKey={licenseKey} />
    </div>
  )
}
