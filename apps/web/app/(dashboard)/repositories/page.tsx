import Link                from 'next/link'
import { Database }        from 'lucide-react'
import { getDb, repositories } from '@backupos/db'
import { GroupFilter }     from './group-filter'
import { DedupBar, fmtBytes } from './dedup-bar'

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

const th: React.CSSProperties = {
  padding: '10px 20px', textAlign: 'left', fontWeight: 500,
  fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const { group } = await searchParams
  const db        = getDb()

  const allRepos = await db.select().from(repositories).all()

  const groups = [...new Set(
    allRepos.map(r => r.group).filter((g): g is string => !!g)
  )].sort()

  const filtered = group
    ? allRepos.filter(r => r.group === group)
    : allRepos

  const statusLabel = (s: string | null) => {
    if (s === 'ok')     return { label: 'Healthy', color: 'var(--ok)'  }
    if (s === 'errors') return { label: 'Errors',  color: 'var(--err)' }
    return               { label: 'Unchecked',     color: 'var(--fg-dim)' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Repositories</h1>
        <Link
          href="/repositories/new"
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#fff', textDecoration: 'none',
          }}
        >
          Add repository
        </Link>
      </div>

      <GroupFilter groups={groups} />

      {filtered.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)',
        }}>
          <Database size={32} color="var(--fg-dim)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No repositories yet</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Add a Restic repository to start tracking backups.</div>
          <Link
            href="/repositories/new"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
              color: '#fff', textDecoration: 'none',
            }}
          >
            Add repository
          </Link>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Name</th>
                <th style={th}>Backend</th>
                <th style={th}>Group</th>
                <th style={{ ...th, textAlign: 'right' }}>Size / dedup</th>
                <th style={{ ...th, textAlign: 'right' }}>Snapshots</th>
                <th style={th}>Last check</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(repo => {
                const { label, color } = statusLabel(repo.lastCheckStatus)
                return (
                  <tr key={repo.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13 }}>
                      <Link href={`/repositories/${repo.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                        {repo.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                      {repo.backend}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-dim)' }}>
                      {repo.group ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <DedupBar stored={repo.sizeBytes ?? null} raw={repo.rawSizeBytes ?? null} />
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {repo.snapshotCount ?? '—'}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12 }}>
                      <span style={{ color }}>{label}</span>
                      {repo.lastCheckedAt && (
                        <span style={{ color: 'var(--fg-dim)', marginLeft: 6 }}>
                          {fmtDate(repo.lastCheckedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
