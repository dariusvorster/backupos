import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, instanceSettings } from '@backupos/db'
import { saveInstanceSettings } from '@/app/actions/settings'

export default async function GeneralSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { saved, error } = await searchParams
  const db = getDb()
  const [cfg] = await db.select().from(instanceSettings).limit(1).all()

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>General</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Configure the server URL for agent connections.</p>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      {error === 'invalid_url' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'color-mix(in srgb, var(--surf) 80%, var(--err) 5%)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)' }}>
          Server URL must start with http:// or https://
        </div>
      )}

      <form action={saveInstanceSettings}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ marginBottom: 0 }}>
            <label style={labelStyle}>Server URL (agent endpoint)</label>
            <input
              name="serverPublicUrl"
              type="url"
              defaultValue={cfg?.serverPublicUrl ?? ''}
              placeholder="http://192.168.69.52:3093"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
              The URL agents use to reach this server. Must be reachable from your agent hosts.
              Leave blank to fall back to the request hostname (unreliable behind reverse proxies or VPNs).
            </div>
          </div>
        </div>
        <button type="submit" style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Save changes
        </button>
      </form>
    </div>
  )
}
