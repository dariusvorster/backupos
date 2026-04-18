import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Database } from 'lucide-react'
import { getDb, repositories } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function checkStatus(s: string | null): BadgeStatus {
  if (s === 'ok')     return 'healthy'
  if (s === 'errors') return 'error'
  return 'idle'
}

function checkLabel(s: string | null): string {
  if (s === 'ok')     return 'Healthy'
  if (s === 'errors') return 'Errors'
  return 'Unchecked'
}

export default async function RepositoriesPage() {
  const db    = getDb()
  const repos = await db.select().from(repositories).all()

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Repositories</h1>
        <Button variant="primary" size="md">
          <Database size={14} />
          Add repository
        </Button>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {repos.length === 0 ? (
          <EmptyState
            type="page"
            icon={<Database size={48} />}
            headline="No repositories yet"
            description="Add a Restic repository to define where your backups are stored — local disk, Backblaze B2, Cloudflare R2, or any S3-compatible target."
            primaryAction={{ label: 'Add repository', href: '#' }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Name</th>
                <th style={th}>Backend</th>
                <th style={thR}>Size</th>
                <th style={thR}>Snapshots</th>
                <th style={th}>Last check</th>
              </tr>
            </thead>
            <tbody>
              {repos.map(repo => (
                <tr key={repo.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/repositories/${repo.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                      {repo.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {repo.backend}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {bytes(repo.sizeBytes)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {repo.snapshotCount ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={checkStatus(repo.lastCheckStatus)} label={checkLabel(repo.lastCheckStatus)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
