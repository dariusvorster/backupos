import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDb, backupJobs, repositories, agents, eq } from '@backupos/db'
import { Button } from '@/components/ui/button'
import { SourceConfigSection } from '@/components/source-config-section'
import { updateJob } from '@/app/actions/jobs'
import { CronInput } from '@/components/cron-input'

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cronError?: string; composeError?: string }>
}) {
  const { id }      = await params
  const { cronError, composeError } = await searchParams
  const db = getDb()

  const [[job], repos, agentList] = await Promise.all([
    db.select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1),
    db.select().from(repositories).all(),
    db.select().from(agents).all(),
  ])
  if (!job) notFound()

  const action = updateJob.bind(null, id)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/jobs/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {job.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Edit job</h1>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
        <form action={action}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Job name
            </label>
            <input
              name="name"
              type="text"
              required
              defaultValue={job.name}
              style={inputStyle}
            />
          </div>

          <SourceConfigSection
            defaultSourceType={job.sourceType}
            initialConfig={job.sourceConfig}
            composeError={composeError}
          />

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Agent
            </label>
            <select name="agentId" defaultValue={job.agentId ?? ''} style={inputStyle}>
              <option value="">— No agent —</option>
              {agentList.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.platform ?? 'unknown'})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
              Repository
            </label>
            <select name="repositoryId" defaultValue={job.repositoryId ?? ''} style={inputStyle}>
              <option value="">— No repository —</option>
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
              defaultValue={job.schedule}
              serverError={cronError}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="primary" size="md">Save changes</Button>
            <Link
              href={`/jobs/${id}`}
              style={{
                padding: '7px 16px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', color: 'var(--fg)', textDecoration: 'none',
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
