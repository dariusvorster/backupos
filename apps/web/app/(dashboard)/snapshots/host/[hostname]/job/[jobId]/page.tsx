import { getDb, snapshots, backupJobs } from '@backupos/db'
import { eq, and, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import { Pin, Lock } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SnapshotActions } from '@/components/snapshot-actions'
import { RestoreFromSnapshotButton } from '@/components/restore-from-snapshot-modal'
import { connectedAgentIds } from '@/lib/ws-state'
import { BreadcrumbOverride } from '@/components/breadcrumb-override'

interface PageProps {
  params: Promise<{ hostname: string; jobId: string }>
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function safeParseTags(json: string | null): string[] {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

function safeParseArray(json: string | null): string[] {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
}

export default async function JobSnapshotsPage({ params }: PageProps) {
  const { hostname: rawHostname, jobId: rawJobId } = await params
  const hostname = decodeURIComponent(rawHostname)
  const jobId = decodeURIComponent(rawJobId)
  const db = getDb()
  const agentConnected = connectedAgentIds().length > 0

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job) notFound()

  const rows = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.hostname, hostname), eq(snapshots.jobId, jobId)))
    .orderBy(desc(snapshots.createdAt))
    .all()

  return (
    <div style={{ padding: '32px 40px' }}>
      <BreadcrumbOverride segment={encodeURIComponent(hostname)} label={hostname} />
      <BreadcrumbOverride segment={jobId} label={job.name} />
      <div style={{ marginBottom: 24 }}>
        <PageHeader title={job.name} />
        <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
          {rows.length} snapshot{rows.length === 1 ? '' : 's'} on {hostname}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '40px 0', textAlign: 'center' }}>
          No snapshots for this job.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surf2)', borderBottom: '1px solid var(--border)' }}>
                {['Snapshot', 'Date', 'Size', 'Tags', 'Restore', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((snap, i) => {
                const resticTags    = safeParseTags(snap.tags)
                const userTags      = safeParseTags(snap.customTags)
                const snapshotPaths = safeParseArray(snap.paths)
                return (
                  <tr key={snap.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', backgroundColor: 'var(--surf)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {snap.pinned        && <Pin  size={12} color="var(--accent)" />}
                        {snap.retentionHold && <span title={snap.holdReason ?? 'Retention hold'}><Lock size={12} color="var(--warn)" /></span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{snap.id}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {snap.createdAt ? snap.createdAt.toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {fmtBytes(snap.sizeBytes)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {resticTags.map(t => (
                          <span key={t} style={{ fontSize: 10, padding: '1px 5px', backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--fg-dim)' }}>{t}</span>
                        ))}
                        {userTags.map(t => (
                          <span key={t} style={{ fontSize: 10, padding: '1px 5px', backgroundColor: 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 20%)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)' }}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <RestoreFromSnapshotButton
                        snapshotId={snap.id}
                        snapshotPaths={snapshotPaths}
                        agentConnected={agentConnected}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <SnapshotActions
                        id={snap.id}
                        pinned={snap.pinned}
                        retentionHold={snap.retentionHold}
                        holdReason={snap.holdReason}
                        holdExpiresAt={snap.holdExpiresAt}
                        customTags={userTags}
                      />
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
