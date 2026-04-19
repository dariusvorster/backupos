import { getDb, repositories, agents } from '@backupos/db'
import { Button } from '@/components/ui/button'

const SOURCE_TYPES = [
  { value: 'filesystem',       label: 'Filesystem',        desc: 'Directories and files on the agent host' },
  { value: 'docker_volume',    label: 'Docker volume',     desc: 'Named Docker volume' },
  { value: 'database',         label: 'Database',          desc: 'PostgreSQL, MySQL, SQLite, Redis' },
  { value: 'proxmox_vm',       label: 'Proxmox VM',        desc: 'Virtual machine via Proxmox API' },
  { value: 'proxmox_lxc',      label: 'Proxmox LXC',       desc: 'Container via Proxmox API' },
  { value: 'windows_system',   label: 'Windows system',    desc: 'Full system backup via VSS' },
  { value: 'nas_share',        label: 'NAS share',         desc: 'SMB or NFS share' },
]

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; sourceType?: string; infraServiceId?: string }>
}) {
  const params              = await searchParams
  const prefillName         = params.name           ?? ''
  const prefillSourceType   = params.sourceType     ?? ''
  const prefillInfraService = params.infraServiceId ?? ''

  const db      = getDb()
  const [repos, agentList] = await Promise.all([
    db.select().from(repositories).all(),
    db.select().from(agents).all(),
  ])

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>New backup job</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 32 }}>
        Configure a new backup job — what to back up, where to store it, and when.
      </p>

      {prefillInfraService && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: 'var(--fg-mute)',
          backgroundColor: 'var(--surf2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px', marginBottom: 16,
        }}>
          <span>Pre-filled from Infra OS service registry. Adjust fields as needed.</span>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
        <form>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Job name
            </label>
            <input
              name="name"
              type="text"
              defaultValue={prefillName}
              placeholder="nightly-postgres"
              style={{
                width: '100%', padding: '8px 12px',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Source type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SOURCE_TYPES.map(st => (
                <label key={st.value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}>
                  <input type="radio" name="sourceType" value={st.value} defaultChecked={prefillSourceType === st.value} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{st.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{st.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Agent
            </label>
            <select name="agentId" style={{
              width: '100%', padding: '8px 12px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
            }}>
              <option value="">— Select agent —</option>
              {agentList.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.platform ?? 'unknown'})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Repository
            </label>
            <select name="repositoryId" style={{
              width: '100%', padding: '8px 12px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
            }}>
              <option value="">— Select repository —</option>
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.backend})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Schedule (cron)
            </label>
            <input
              name="schedule"
              type="text"
              placeholder="0 2 * * *"
              style={{
                width: '100%', padding: '8px 12px',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
              Standard cron expression. e.g. <code>0 2 * * *</code> = daily at 02:00
            </div>
          </div>

          {prefillInfraService && (
            <input type="hidden" name="infraServiceId" value={prefillInfraService} />
          )}

          <Button type="submit" variant="primary" size="md">Create job</Button>
        </form>
      </div>
    </div>
  )
}
