import { getDb, snapshots, repositories, backupJobs } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { SnapshotActions } from '@/components/snapshot-actions'
import { Pin, Lock } from 'lucide-react'

function safeParseTags(json: string | null): string[] {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

interface PageProps {
  searchParams: Promise<{ repo?: string; filter?: string; tag?: string }>
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function buildUrl(
  repoFilter: string,
  listFilter: string,
  tagFilter: string,
  overrides: Record<string, string>,
): string {
  const p = new URLSearchParams()
  if (repoFilter)             p.set('repo',   repoFilter)
  if (listFilter !== 'all')   p.set('filter', listFilter)
  if (tagFilter)              p.set('tag',    tagFilter)
  for (const [k, v] of Object.entries(overrides)) {
    if (v) p.set(k, v); else p.delete(k)
  }
  const s = p.toString()
  return `/snapshots${s ? `?${s}` : ''}`
}

export default async function SnapshotsPage({ searchParams }: PageProps) {
  const params     = await searchParams
  const repoFilter = params.repo   ?? ''
  const listFilter = params.filter ?? 'all'
  const tagFilter  = params.tag    ?? ''

  const db    = getDb()
  const repos = await db.select({ id: repositories.id, name: repositories.name }).from(repositories).all()
  const jobs  = await db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all()

  const allSnaps = repoFilter
    ? await db.select().from(snapshots).where(eq(snapshots.repositoryId, repoFilter)).all()
    : await db.select().from(snapshots).all()

  const filtered = allSnaps.filter(s => {
    if (listFilter === 'pinned') return s.pinned
    if (listFilter === 'held')   return s.retentionHold
    if (listFilter === 'tagged') return safeParseTags(s.customTags).length > 0
    return true
  }).filter(s => {
    if (!tagFilter) return true
    return safeParseTags(s.customTags).includes(tagFilter)
  })

  const pinnedCount = allSnaps.filter(s => s.pinned).length
  const heldCount   = allSnaps.filter(s => s.retentionHold).length

  const FILTER_TABS = [
    { id: 'all',    label: 'All' },
    { id: 'pinned', label: `Pinned${pinnedCount > 0 ? ` (${pinnedCount})` : ''}` },
    { id: 'held',   label: `Held${heldCount > 0 ? ` (${heldCount})` : ''}` },
    { id: 'tagged', label: 'Tagged' },
  ]

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Snapshots</div>
        {(pinnedCount > 0 || heldCount > 0) && (
          <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            {pinnedCount > 0 && <span>{pinnedCount} pinned</span>}
            {pinnedCount > 0 && heldCount > 0 && <span> · </span>}
            {heldCount > 0 && <span>{heldCount} under retention hold</span>}
            <span style={{ color: 'var(--fg-dim)' }}> — protected from forget policy</span>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Repo selector as a GET form */}
        <form method="get" action="/snapshots">
          <select
            name="repo"
            defaultValue={repoFilter}
            style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          >
            <option value="">All repositories</option>
            {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {listFilter !== 'all' && <input type="hidden" name="filter" value={listFilter} />}
          {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
          <button type="submit" style={{
            marginLeft: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'none', color: 'var(--fg-mute)',
          }}>Go</button>
        </form>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_TABS.map(tab => (
            <a
              key={tab.id}
              href={buildUrl(repoFilter, listFilter, tagFilter, { filter: tab.id === 'all' ? '' : tab.id, tag: '' })}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                textDecoration: 'none', cursor: 'pointer',
                border: '1px solid var(--border)',
                backgroundColor: listFilter === tab.id ? 'var(--accent)' : 'var(--surf2)',
                color: listFilter === tab.id ? '#fff' : 'var(--fg-mute)',
              }}
            >
              {tab.label}
            </a>
          ))}
        </div>

        {tagFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-mute)' }}>
            Tag: <strong style={{ color: 'var(--fg)' }}>{tagFilter}</strong>
            <a href={buildUrl(repoFilter, listFilter, tagFilter, { tag: '' })} style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>✕</a>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '40px 0', textAlign: 'center' }}>
          {allSnaps.length === 0
            ? 'No snapshots yet. Run a backup job to create the first snapshot.'
            : 'No snapshots match the current filter.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surf2)', borderBottom: '1px solid var(--border)' }}>
                {['Snapshot', 'Job', 'Date', 'Size', 'Tags', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((snap, i) => {
                const job        = jobs.find(j => j.id === snap.jobId)
                const resticTags: string[] = safeParseTags(snap.tags)
                const userTags:   string[] = safeParseTags(snap.customTags)
                return (
                  <tr key={snap.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', backgroundColor: 'var(--surf)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {snap.pinned        && <Pin  size={12} color="var(--accent)" />}
                        {snap.retentionHold && <span title={snap.holdReason ?? 'Retention hold'}><Lock size={12} color="var(--warn)" /></span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{snap.id}</span>
                      </div>
                      {snap.retentionHold && snap.holdExpiresAt && (
                        <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>
                          Hold until {snap.holdExpiresAt.toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
                      {job?.name ?? '—'}
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
                          <span key={t} style={{
                            fontSize: 10, padding: '1px 5px',
                            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                            borderRadius: 3, color: 'var(--fg-dim)',
                          }}>{t}</span>
                        ))}
                        {userTags.map(t => (
                          <a key={t} href={buildUrl(repoFilter, listFilter, tagFilter, { tag: t, filter: '' })} style={{
                            fontSize: 10, padding: '1px 5px', textDecoration: 'none',
                            backgroundColor: 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 20%)',
                            border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)',
                          }}>{t}</a>
                        ))}
                      </div>
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
