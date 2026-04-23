import { getDb, infraOsServices, backupJobs } from '@backupos/db'
import { addInfraServiceAction, removeInfraService } from '@/app/actions/infra-os'
import Link from 'next/link'
import { Cpu } from 'lucide-react'

const SERVICE_TYPES = [
  { value: 'database',   label: 'Database',   desc: 'PostgreSQL, MySQL, Redis, etc.' },
  { value: 'filesystem', label: 'Filesystem',  desc: 'Directory or mount point' },
  { value: 'container',  label: 'Container',   desc: 'Docker container or volume' },
]

export default async function InfraOsSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const db       = getDb()
  const services = await db.select().from(infraOsServices).all()
  const { saved } = await searchParams

  const coveredIds = new Set(
    (await db.select({ infraServiceId: backupJobs.infraServiceId })
      .from(backupJobs)
      .all())
      .map(j => j.infraServiceId)
      .filter((id): id is string => id !== null && id !== undefined)
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Settings</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Infra OS services</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Register services here to track backup coverage. Services without a backup job appear on the dashboard.
        </p>
      </div>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Service updated.
        </div>
      )}

      {/* Add service form */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Cpu size={16} color="var(--fg-mute)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Add service</span>
        </div>
        <form action={addInfraServiceAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Service name *</label>
              <input
                name="name"
                type="text"
                required
                placeholder="PostgreSQL main"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Host / address</label>
              <input
                name="host"
                type="text"
                placeholder="db.internal:5432"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Type *</label>
            <select
              name="serviceType"
              required
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)' }}
            >
              <option value="">— Select type —</option>
              {SERVICE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Description</label>
            <input
              name="description"
              type="text"
              placeholder="Optional notes"
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <button type="submit" style={{
              fontSize: 13, padding: '7px 16px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff',
            }}>
              Add service
            </button>
          </div>
        </form>
      </div>

      {/* Service list */}
      {services.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fg-mute)' }}>No services registered yet.</p>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {services.map((svc, i) => {
            const covered = coveredIds.has(svc.id)
            const boundRemove = removeInfraService.bind(null, svc.id)
            return (
              <div key={svc.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: covered ? 'var(--ok)' : 'var(--warn)',
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: covered
                    ? 'color-mix(in srgb, transparent 85%, var(--ok) 15%)'
                    : 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
                  border: `1px solid ${covered
                    ? 'color-mix(in srgb, transparent 70%, var(--ok) 30%)'
                    : 'color-mix(in srgb, transparent 70%, var(--warn) 30%)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {covered ? 'Covered ✓' : 'No backup ⚠'}
                </span>
                <form action={boundRemove}>
                  <button type="submit" style={{
                    fontSize: 12, padding: '3px 10px', cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    color: 'var(--fg-mute)', background: 'var(--surf2)',
                  }}>
                    Remove
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
