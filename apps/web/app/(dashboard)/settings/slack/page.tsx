import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/user'
import { getDb, alertChannels, eq } from '@backupos/db'

export default async function SlackSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const db = getDb()
  const channels = await db.select().from(alertChannels)
    .where(eq(alertChannels.type, 'slack')).all()

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Slack integration</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>
        Slack channels are managed in Alert channels.{' '}
        <Link href="/settings/alerts" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Configure alert channels →</Link>
      </p>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Active Slack channels ({channels.length})
        </div>
        {channels.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            No Slack channels configured.{' '}
            <Link href="/settings/alerts" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Add one in Alert channels.</Link>
          </div>
        ) : channels.map(ch => (
          <div key={ch.id} style={{ padding: '12px 20px', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{ch.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{ch.enabled ? 'Active' : 'Disabled'}</div>
            </div>
            <Link href="/settings/alerts" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>Manage →</Link>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link href="/settings/alerts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          + Add Slack channel
        </Link>
      </div>
    </div>
  )
}
