import type { ComponentProps } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { getDb, restoreSpecs, restoreRuns, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { forkSpec } from '@/app/actions/restore'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function validationBadge(s: string | null): BadgeStatus {
  if (s === 'valid')   return 'healthy'
  if (s === 'invalid') return 'error'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const TEMPLATES: { name: string; description: string; yaml: string }[] = [
  {
    name: 'Postgres DR',
    description: 'Full PostgreSQL database disaster recovery.',
    yaml: `name: Postgres DR
steps:
  - name: Restore snapshot to staging area
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target /tmp/restore-\${DATE}
  - name: Import dump into Postgres
    type: shell
    command: psql -U postgres -h \${HOST} -d mydb < /tmp/restore-\${DATE}/dump.sql
  - name: Verify row counts
    type: shell
    command: psql -U postgres -h \${HOST} -c "SELECT count(*) FROM users;"
`,
  },
  {
    name: 'Docker stack DR',
    description: 'Bring up a Docker Compose stack from a backup snapshot.',
    yaml: `name: Docker stack DR
steps:
  - name: Restore snapshot
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target /tmp/stack-\${DATE}
  - name: Stop running stack
    type: shell
    command: docker compose -f /opt/myapp/docker-compose.yml down
  - name: Overwrite volumes
    type: shell
    command: cp -r /tmp/stack-\${DATE}/volumes /opt/myapp/volumes
  - name: Start stack
    type: shell
    command: docker compose -f /opt/myapp/docker-compose.yml up -d
`,
  },
  {
    name: 'Full-host DR',
    description: 'Bare-metal full-host restore to a new machine.',
    yaml: `name: Full-host DR
steps:
  - name: Restore snapshot to root
    type: shell
    command: restic restore \${SNAPSHOT_ID} --target / --host \${HOST}
  - name: Regenerate initramfs
    type: shell
    command: update-initramfs -u
  - name: Update GRUB
    type: shell
    command: update-grub
`,
  },
]

export default async function RestorePage() {
  const db = getDb()
  const [specs, recentRuns] = await Promise.all([
    db.select().from(restoreSpecs).all(),
    db.select().from(restoreRuns).orderBy(desc(restoreRuns.startedAt)).limit(10).all(),
  ])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Restore</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled
            title="Coming soon"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg-dim)',
              cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            Step marketplace
          </button>
          <Link href="/restore/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              <RotateCcw size={14} />
              New restore spec
            </Button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* Specs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Restore specs
          </div>
          {specs.length === 0 ? (
            <EmptyState
              type="inline"
              headline="No restore specs yet."
              primaryAction={{ label: 'Create one', href: '/restore/new' }}
            />
          ) : (
            specs.map(spec => (
              <div key={spec.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Link href={`/restore/${spec.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                    {spec.name}
                  </Link>
                </div>
                <Badge
                  status={validationBadge(spec.validationStatus)}
                  label={spec.validationStatus ?? 'Untested'}
                />
              </div>
            ))
          )}
        </div>

        {/* Recent runs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Recent restore runs
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState type="inline" headline="No restore runs yet" />
          ) : (
            recentRuns.map(run => (
              <div key={run.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(run.startedAt)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{run.trigger ?? 'manual'}</div>
                </div>
                <Badge status={run.status as BadgeStatus} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Template library */}
      <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Template library</div>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16 }}>
        Pre-built restore specs for common scenarios. Fork one to get started.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {TEMPLATES.map(t => {
          const action = forkSpec.bind(null, t.name, t.yaml)
          return (
            <div
              key={t.name}
              style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)', flex: 1 }}>{t.description}</div>
              <pre style={{
                fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)',
                padding: '8px 10px', margin: 0,
                overflow: 'hidden', maxHeight: 80, whiteSpace: 'pre-wrap',
              }}>
                {t.yaml.split('\n').slice(0, 4).join('\n')}…
              </pre>
              <form action={action}>
                <button
                  type="submit"
                  style={{
                    width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 500,
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'var(--surf2)', color: 'var(--fg-mute)',
                    cursor: 'pointer',
                  }}
                >
                  Fork →
                </button>
              </form>
            </div>
          )
        })}
      </div>
    </div>
  )
}
