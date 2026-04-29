import Link from 'next/link'
import { getDb, alertChannels } from '@backupos/db'
import { INTEGRATIONS_REGISTRY } from '@/lib/integrations'

export default async function IntegrationsPage() {
  const db       = getDb()
  const channels = await db.select({ type: alertChannels.type }).from(alertChannels).all()

  const countByType: Record<string, number> = {}
  for (const ch of channels) {
    countByType[ch.type] = (countByType[ch.type] ?? 0) + 1
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <a
        href="/settings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}
      >
        ← Settings
      </a>

      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>Integrations</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 28, lineHeight: 1.5 }}>
        Connect BackupOS to your notification and incident management tools. Each integration is first-class with per-channel setup and test delivery.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {INTEGRATIONS_REGISTRY.map(integ => {
          const count = countByType[integ.type] ?? 0
          return (
            <Link
              key={integ.type}
              href={`/settings/integrations/${integ.type}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '16px 20px',
                cursor: 'pointer', transition: 'border-color 0.1s',
                display: 'flex', flexDirection: 'column', gap: 8, height: '100%', boxSizing: 'border-box',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{integ.name}</span>
                  {count > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      color: 'var(--accent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    }}>
                      {count} channel{count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--fg-mute)', margin: 0, lineHeight: 1.5 }}>
                  {integ.description}
                </p>
                <span style={{ fontSize: 12, color: 'var(--accent)', marginTop: 'auto' }}>
                  Configure →
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
