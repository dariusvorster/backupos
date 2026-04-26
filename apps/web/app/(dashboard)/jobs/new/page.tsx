import { getDb, repositories, agents } from '@backupos/db'
import { Button } from '@/components/ui/button'
import { createJob } from '@/app/actions/jobs'
import { SourceConfigSection } from '@/components/source-config-section'
import { CronInput } from '@/components/cron-input'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; sourceType?: string; infraServiceId?: string; cronError?: string }>
}) {
  const params              = await searchParams
  const prefillName         = params.name           ?? ''
  const prefillSourceType   = params.sourceType     ?? ''
  const prefillInfraService = params.infraServiceId ?? ''
  const cronError           = params.cronError

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
        <form action={createJob}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Job name
            </label>
            <input
              name="name"
              type="text"
              required
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

          <SourceConfigSection defaultSourceType={prefillSourceType || 'filesystem'} />

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
            <CronInput
              name="schedule"
              required
              defaultValue=""
              serverError={cronError}
              style={{
                width: '100%', padding: '8px 12px',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
              }}
            />
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
