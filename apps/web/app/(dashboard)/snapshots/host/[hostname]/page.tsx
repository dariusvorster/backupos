import { getDb, snapshots, backupJobs } from '@backupos/db'
import { eq, sql, desc } from '@backupos/db'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

interface PageProps {
  params: Promise<{ hostname: string }>
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default async function HostJobsPage({ params }: PageProps) {
  const { hostname: rawHostname } = await params
  const hostname = decodeURIComponent(rawHostname)
  const db = getDb()

  const rows = await db
    .select({
      jobId:         snapshots.jobId,
      jobName:       backupJobs.name,
      snapshotCount: sql<number>`count(*)`.as('snapshot_count'),
      mostRecent:    sql<number>`max(${snapshots.createdAt})`.as('most_recent'),
      totalSize:     sql<number>`sum(${snapshots.sizeBytes})`.as('total_size'),
    })
    .from(snapshots)
    .leftJoin(backupJobs, eq(backupJobs.id, snapshots.jobId))
    .where(eq(snapshots.hostname, hostname))
    .groupBy(snapshots.jobId, backupJobs.name)
    .orderBy(desc(sql`max(${snapshots.createdAt})`))
    .all()

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ marginBottom: 24 }}>
        <PageHeader title={hostname} />
        <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
          {rows.length} job{rows.length === 1 ? '' : 's'} on this host
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '40px 0', textAlign: 'center' }}>
          No snapshots found for host <strong>{hostname}</strong>.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surf2)', borderBottom: '1px solid var(--border)' }}>
                {['Job', 'Snapshots', 'Most recent', 'Total size', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const jobId = r.jobId ?? '(no job)'
                const jobName = r.jobName ?? '(deleted job)'
                const mostRecent = r.mostRecent ? new Date(Number(r.mostRecent)) : null
                const href = r.jobId ? `/snapshots/host/${encodeURIComponent(hostname)}/job/${encodeURIComponent(r.jobId)}` : '#'
                return (
                  <tr key={jobId} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', backgroundColor: 'var(--surf)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                      {r.jobId ? <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{jobName}</Link> : jobName}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
                      {Number(r.snapshotCount)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {mostRecent ? mostRecent.toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {fmtBytes(Number(r.totalSize))}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {r.jobId && <Link href={href} style={{ color: 'var(--fg-dim)' }}><ChevronRight size={14} /></Link>}
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
