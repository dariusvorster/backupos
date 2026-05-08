import { redirect, notFound } from 'next/navigation'
import { getDb, hypervisorIntegrations, eq } from '@backupos/db'
import Link from 'next/link'
import { updateHypervisorIntegration } from '@/app/actions/hypervisors'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: 'var(--surf2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--fg)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: 'var(--fg-mute)',
  marginBottom: 6,
  fontWeight: 500,
}

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: 'var(--surf)',
  color: 'var(--fg-dim)',
  cursor: 'not-allowed',
}

export default async function EditHypervisorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const db = getDb()
  const [integration] = await db
    .select()
    .from(hypervisorIntegrations)
    .where(eq(hypervisorIntegrations.id, id))
    .limit(1)

  if (!integration) notFound()

  let cfg: {
    host?: string
    username?: string
    port?: number
    cert_fingerprint_sha256?: string
  } = {}
  try {
    cfg = JSON.parse(integration.config)
  } catch {
    cfg = {}
  }

  async function update(formData: FormData) {
    'use server'
    const result = await updateHypervisorIntegration(id, formData)
    if (result?.error) return
    redirect('/hypervisors')
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <Link href="/hypervisors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
        ← Hypervisors
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8, marginBottom: 24 }}>
        Edit hypervisor
      </h1>

      <form action={update}>
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input name="name" required defaultValue={integration.name} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Type</label>
            <input value={integration.type} readOnly style={readonlyStyle} />
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
              Type cannot be changed. Delete and recreate to change type.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Host</label>
            <input name="host" required defaultValue={cfg.host ?? ''} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Username</label>
            <input name="username" defaultValue={cfg.username ?? ''} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="unchanged"
              autoComplete="new-password"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
              Leave blank to keep the existing password.
            </div>
          </div>

          {cfg.port !== undefined && (
            <div>
              <label style={labelStyle}>Port</label>
              <input name="port" type="number" defaultValue={cfg.port} style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Certificate fingerprint (SHA-256)</label>
            <input
              name="cert_fingerprint_sha256"
              defaultValue={cfg.cert_fingerprint_sha256 ?? ''}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="submit"
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-fg)',
              }}
            >
              Save changes
            </button>
            <Link
              href="/hypervisors"
              style={{
                padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surf2)', color: 'var(--fg)',
                textDecoration: 'none',
              }}
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
