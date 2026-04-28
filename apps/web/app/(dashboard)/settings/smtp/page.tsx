import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, smtpConfig } from '@backupos/db'
import { saveSmtpConfig } from '@/app/actions/settings'

export default async function SmtpSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { saved } = await searchParams
  const db = getDb()
  const [cfg] = await db.select().from(smtpConfig).limit(1).all()

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }
  const fieldStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Email SMTP</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Configure outbound email delivery for alerts and notifications.</p>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      {cfg?.enabled && !cfg?.toAddresses && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--warn-dim)', border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--warn)' }}>
          Alerts will not be delivered — no recipients configured. Add at least one address below.
        </div>
      )}

      <form action={saveSmtpConfig}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border2)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Enable SMTP</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Send emails via your SMTP server</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input name="enabled" type="checkbox" defaultChecked={cfg?.enabled ?? false} />
              <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>Enabled</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>SMTP host</label>
              <input name="host" type="text" defaultValue={cfg?.host ?? ''} placeholder="smtp.example.com" style={inputStyle} />
            </div>
            <div style={{ width: 100 }}>
              <label style={labelStyle}>Port</label>
              <input name="port" type="number" defaultValue={cfg?.port ?? 587} style={inputStyle} />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Username</label>
            <input name="username" type="text" defaultValue={cfg?.username ?? ''} placeholder="user@example.com" style={inputStyle} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Password</label>
            <input name="password" type="password" defaultValue={cfg?.password ?? ''} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>From name</label>
              <input name="fromName" type="text" defaultValue={cfg?.fromName ?? 'BackupOS'} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>From email</label>
              <input name="fromEmail" type="email" defaultValue={cfg?.fromEmail ?? ''} placeholder="noreply@example.com" style={inputStyle} />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Send alerts to</label>
            <input name="toAddresses" type="text" defaultValue={cfg?.toAddresses ?? ''} placeholder="alice@example.com, bob@example.com" style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>Comma-separated list of email addresses to receive alerts. Leave blank to disable alert delivery.</div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input name="tls" type="checkbox" defaultChecked={cfg?.tls ?? true} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>Use TLS/STARTTLS</span>
          </label>
        </div>

        <button type="submit" style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Save changes
        </button>
      </form>
    </div>
  )
}
