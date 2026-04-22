import { redirect } from 'next/navigation'
import { getDb, hypervisorIntegrations } from '@backupos/db'
import Link from 'next/link'

async function createHypervisor(formData: FormData) {
  'use server'
  const name = (formData.get('name') as string).trim()
  const type = (formData.get('type') as string).trim()
  const host = (formData.get('host') as string).trim()
  const username = (formData.get('username') as string).trim()
  const password = (formData.get('password') as string).trim()
  const port = formData.get('port') ? Number(formData.get('port')) : undefined

  if (!name || !type || !host) return

  const db = getDb()
  await db.insert(hypervisorIntegrations).values({
    id:        crypto.randomUUID(),
    name,
    type:      type as 'proxmox' | 'xcpng' | 'vmware',
    config:    JSON.stringify({ host, username, password, port }),
    status:    'unknown',
    createdAt: new Date(),
  })

  redirect('/hypervisors')
}

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

export default function NewHypervisorPage() {
  return (
    <div style={{ maxWidth: 520 }}>
      <Link href="/hypervisors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
        ← Hypervisors
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8, marginBottom: 24 }}>
        Add hypervisor
      </h1>

      <form action={createHypervisor}>
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
            <input name="name" required placeholder="Home Proxmox" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Type</label>
            <select name="type" required style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="proxmox">Proxmox VE</option>
              <option value="xcpng">XCP-ng</option>
              <option value="vmware">VMware ESXi</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Host / IP</label>
            <input name="host" required placeholder="192.168.1.10" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Port (optional)</label>
            <input name="port" type="number" placeholder="8006" style={{ ...inputStyle, width: 120 }} />
          </div>

          <div>
            <label style={labelStyle}>Username</label>
            <input name="username" placeholder="root@pam" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Password / API token</label>
            <input name="password" type="password" placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              style={{
                padding: '9px 20px',
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add hypervisor
            </button>
            <Link href="/hypervisors" style={{
              padding: '9px 16px',
              fontSize: 14,
              color: 'var(--fg-mute)',
              textDecoration: 'none',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surf2)',
            }}>
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
