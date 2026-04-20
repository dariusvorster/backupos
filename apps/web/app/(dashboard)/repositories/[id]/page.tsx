import { getDb, repositories } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { snapshots, backupJobs } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { computeForecast, fmtCents, fmtGb, fmtGbPerMonth, BACKEND_PRESETS } from '@/lib/growth-forecast'
import { saveCostConfig } from '@/app/actions/repository-cost'
import { setReplicas, setRepoGroup, addReplica, removeReplicaAt } from '@/app/actions/repositories'
import type { ReplicaEntry }          from '@/app/actions/repositories'
import { setEscrowAction, clearEscrow } from '@/app/actions/escrow'
import { TrendingUp, AlertTriangle, Info, ShieldCheck, ShieldAlert } from 'lucide-react'
import { DedupBar, fmtBytes } from '../dedup-bar'

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  const replicas: ReplicaEntry[] = (() => {
    try { return repo.replicas ? (JSON.parse(repo.replicas) as ReplicaEntry[]) : [] }
    catch { return [] }
  })()

  // Fetch last 90 snapshots for this repo (for growth chart)
  const recentSnaps = await db.select({ sizeBytes: snapshots.sizeBytes, createdAt: snapshots.createdAt })
    .from(snapshots)
    .where(eq(snapshots.repositoryId, repo.id))
    .orderBy(desc(snapshots.createdAt))
    .limit(90)
    .all()

  // Fetch retention policy from jobs attached to this repo
  const jobs = await db.select({
    keepMonthly: backupJobs.keepMonthly,
    keepYearly:  backupJobs.keepYearly,
    keepWeekly:  backupJobs.keepWeekly,
  }).from(backupJobs).where(eq(backupJobs.repositoryId, repo.id)).all()

  // Estimate effective retention window in months
  const maxRetentionMonths = jobs.reduce((max, j) => {
    const months = (j.keepYearly ?? 0) * 12 + (j.keepMonthly ?? 0) + Math.round((j.keepWeekly ?? 0) / 4)
    return Math.max(max, months)
  }, 0) || null

  const historyPoints = recentSnaps
    .filter((s): s is { sizeBytes: number; createdAt: Date } =>
      s.sizeBytes !== null && s.createdAt !== null
    )
    .map(s => ({ date: s.createdAt, sizeBytes: s.sizeBytes }))

  const forecast = computeForecast(
    historyPoints,
    maxRetentionMonths,
    repo.costPerGbMonth ?? null,
    repo.monthlyBudgetCents ?? null,
  )

  const boundSaveCostConfig = saveCostConfig.bind(null, repo.id)
  const boundSetEscrow   = setEscrowAction.bind(null, repo.id)
  const boundClearEscrow = clearEscrow.bind(null, repo.id)
  const hasEscrow        = repo.escrowedKey !== null && repo.escrowedKey !== undefined
  const preset = BACKEND_PRESETS[repo.backend as keyof typeof BACKEND_PRESETS]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/repositories" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Repositories</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>{repo.name}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Backend"    value={repo.backend} />
        <StatCard label="Total size" value={bytes(repo.sizeBytes)} />
        <StatCard label="Snapshots"  value={String(repo.snapshotCount ?? '—')} />
        <StatCard label="Last check" value={repo.lastCheckStatus ?? 'unchecked'} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="md">Browse snapshots</Button>
        </Link>
        <Button variant="secondary" size="md">Run check</Button>
      </div>

      {/* Environment group */}
      {(() => {
        const boundSetGroup = async (formData: FormData) => {
          'use server'
          const g = (formData.get('group') as string ?? '').trim() || null
          await setRepoGroup(repo.id, g)
        }
        return (
          <div style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 20px',
            marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
              Environment group
            </div>
            <form action={boundSetGroup} style={{ display: 'flex', gap: 8 }}>
              <input
                name="group"
                defaultValue={repo.group ?? ''}
                placeholder="prod / home / lab"
                style={{
                  padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', width: 160,
                }}
              />
              <button type="submit" style={{
                padding: '5px 14px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: '#fff',
              }}>Save</button>
            </form>
          </div>
        )
      })()}

      {/* Replication targets */}
      {(() => {
        const boundAddReplica = async (formData: FormData) => {
          'use server'
          const label   = ((formData.get('label')   as string) ?? '').trim()
          const backend = ((formData.get('backend') as string) ?? '').trim()
          if (!label || !backend) return
          await addReplica(repo.id, { label, backend })
        }
        return (
          <div style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
              Replication targets
            </div>

            {replicas.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 12 }}>
                No replication targets configured.
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {replicas.map((r, i) => {
                  const boundRemove = async () => {
                    'use server'
                    await removeReplicaAt(repo.id, i)
                  }
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '6px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 13, color: 'var(--fg)', flex: 1 }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{r.backend}</span>
                      <form action={boundRemove}>
                        <button type="submit" style={{
                          fontSize: 11, color: 'var(--err)', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '2px 6px',
                        }}>Remove</button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}

            <form action={boundAddReplica} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                name="label"
                placeholder="Label (e.g. R2 offsite)"
                required
                style={{
                  flex: 1, padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                }}
              />
              <input
                name="backend"
                placeholder="Backend (e.g. rclone:r2)"
                required
                style={{
                  flex: 1, padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                }}
              />
              <button type="submit" style={{
                padding: '5px 14px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: '#fff',
              }}>Add</button>
            </form>
          </div>
        )
      })()}

      {/* Storage efficiency */}
      {repo.sizeBytes != null && (
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '18px 20px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
            Storage efficiency
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <DedupBar stored={repo.sizeBytes} raw={repo.rawSizeBytes ?? null} />
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              {repo.rawSizeBytes
                ? `${fmtBytes(repo.sizeBytes)} stored of ${fmtBytes(repo.rawSizeBytes)} original`
                : `${fmtBytes(repo.sizeBytes)} stored (no dedup data yet)`}
            </div>
          </div>
        </div>
      )}

      {/* Forecast card */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 24,
      }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <TrendingUp size={16} color="var(--accent)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Growth forecast</span>
        </div>

        {/* Budget exceeded banner */}
        {forecast.budgetExceededMonth !== null && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, var(--warn) 10%)',
            border: '1px solid var(--warn)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--fg)' }}>
              Projected cost will exceed your {fmtCents(repo.monthlyBudgetCents ?? 0)}/mo budget in{' '}
              <strong>{forecast.budgetExceededMonth} month{forecast.budgetExceededMonth !== 1 ? 's' : ''}</strong>.
            </span>
          </div>
        )}

        {/* SVG Chart */}
        {historyPoints.length >= 2 ? (
          (() => {
            const W = 600, H = 140, PAD_L = 48, PAD_R = 16, PAD_T = 8, PAD_B = 24
            const chartW = W - PAD_L - PAD_R
            const chartH = H - PAD_T - PAD_B

            const allPoints = [
              ...forecast.history.map(h => ({ date: h.date, bytes: h.sizeBytes, type: 'actual' as const })),
              ...forecast.forecast.map(f => ({ date: f.date, bytes: f.sizeBytes, type: 'forecast' as const, lower: f.lower, upper: f.upper })),
            ]

            const minDate  = allPoints[0]!.date.getTime()
            const maxDate  = allPoints[allPoints.length - 1]!.date.getTime()
            const maxBytes = Math.max(...allPoints.map(p => ('upper' in p ? p.upper : p.bytes))) * 1.1 || 1

            function px(date: Date) { return PAD_L + ((date.getTime() - minDate) / (maxDate - minDate)) * chartW }
            function py(b: number) { return PAD_T + chartH - (b / maxBytes) * chartH }

            const actualPts   = forecast.history.map(h => `${px(h.date)},${py(h.sizeBytes)}`).join(' ')
            const forecastPts = forecast.forecast.map(f => `${px(f.date)},${py(f.sizeBytes)}`).join(' ')
            const bandPath    = [
              ...forecast.forecast.map((f, i) => `${i === 0 ? 'M' : 'L'}${px(f.date)},${py(f.upper)}`),
              ...forecast.forecast.slice().reverse().map((f) => `L${px(f.date)},${py(f.lower)}`),
              'Z',
            ].join(' ')

            const yLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
              y:    PAD_T + chartH * (1 - t),
              label: fmtGb(maxBytes * t),
            }))

            return (
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', marginBottom: 16, overflow: 'visible' }}>
                {/* Y grid lines */}
                {yLabels.map(({ y, label }) => (
                  <g key={y}>
                    <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeDasharray="2,3" />
                    <text x={PAD_L - 4} y={y + 4} fontSize={9} fill="var(--fg-dim)" textAnchor="end">{label}</text>
                  </g>
                ))}

                {/* Today marker */}
                <line x1={px(new Date())} y1={PAD_T} x2={px(new Date())} y2={PAD_T + chartH} stroke="var(--border)" strokeDasharray="4,3" />

                {/* Confidence band */}
                <path d={bandPath} fill="var(--accent)" fillOpacity={0.1} />

                {/* Actual line */}
                {forecast.history.length >= 2 && (
                  <polyline points={actualPts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* Forecast line */}
                {forecast.forecast.length >= 2 && (
                  <polyline points={forecastPts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4,3" strokeLinecap="round" />
                )}

                {/* Plateau marker */}
                {forecast.plateauMonth !== null && forecast.plateauBytes !== null && (() => {
                  const plateauDate = forecast.forecast[forecast.plateauMonth - 1]?.date
                  if (!plateauDate) return null
                  const xp = px(plateauDate)
                  const yp = py(forecast.plateauBytes)
                  return (
                    <g>
                      <line x1={xp} y1={PAD_T} x2={xp} y2={PAD_T + chartH} stroke="var(--ok)" strokeDasharray="3,3" opacity={0.6} />
                      <text x={xp + 3} y={PAD_T + 10} fontSize={9} fill="var(--ok)">plateau</text>
                    </g>
                  )
                })()}
              </svg>
            )
          })()
        ) : (
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '20px 0', textAlign: 'center', marginBottom: 16 }}>
            Not enough snapshot history to build a forecast. Run a few backups first.
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Current size',    value: fmtGb(forecast.currentGb * 1_073_741_824) },
            { label: 'Growth rate',     value: fmtGbPerMonth(forecast.dailyGrowthBytes) },
            { label: 'Projected (12mo)', value: fmtGb(forecast.forecastGb12mo * 1_073_741_824) },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Cost row */}
        {forecast.currentCostCents !== null && forecast.forecast12moCents !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, fontSize: 13, color: 'var(--fg-mute)' }}>
            <span>Current estimated cost: <strong style={{ color: 'var(--fg)' }}>{fmtCents(forecast.currentCostCents)}/mo</strong></span>
            <span>→</span>
            <span>Estimated in 12 months: <strong style={{ color: forecast.forecast12moCents > (forecast.currentCostCents * 1.5) ? 'var(--err)' : 'var(--fg)' }}>{fmtCents(forecast.forecast12moCents)}/mo</strong></span>
            {forecast.plateauMonth && (
              <span style={{ fontSize: 12, color: 'var(--ok)' }}>
                Storage plateaus ~month {forecast.plateauMonth} with current retain policy
              </span>
            )}
          </div>
        )}

        {/* Suggestions */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Suggestions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                title:  'Tighten retention policy',
                desc:   'Reducing keep_monthly from 12 to 6 could halve long-term storage growth.',
                action: `/jobs?repo=${repo.id}`,
                label:  'Edit jobs',
              },
              {
                title:  'Switch backend',
                desc:   (() => {
                  if (!preset) return 'Compare storage costs across supported backends.'
                  const repoCost = repo.costPerGbMonth
                  const b2Cost   = BACKEND_PRESETS['b2']!.costPerGbMonth
                  if (repoCost != null && repoCost > b2Cost) {
                    return `You're on ${preset.label}. Backblaze B2 at $0.006/GB could save ~${Math.round((1 - b2Cost / repoCost) * 100)}%.`
                  }
                  return `You're on ${preset.label}. Compare costs across S3, R2, B2.`
                })(),
                action: null,
                label:  null,
              },
              {
                title:  'Enable compression',
                desc:   'Restic compresses by default. Ensure --compression=max is set in your agent config for maximum deduplication benefit.',
                action: null,
                label:  null,
              },
              {
                title:  'Exclude large files',
                desc:   'Identify and exclude frequently changing large files (e.g. VM disk images, log archives) that contribute most to growth.',
                action: null,
                label:  null,
              },
            ].map(s => (
              <div key={s.title} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px',
              }}>
                <Info size={13} color="var(--fg-dim)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{s.desc}</div>
                </div>
                {s.action && s.label && (
                  <a href={s.action} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{s.label} →</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Cost config form */}
        <details style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}>Configure cost &amp; budget</summary>
          <form action={boundSaveCostConfig} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Cost ($/GB/month)</label>
              <input
                name="costPerGbMonth"
                type="number"
                step="0.001"
                min="0"
                defaultValue={repo.costPerGbMonth !== null && repo.costPerGbMonth !== undefined ? (repo.costPerGbMonth / 1000).toFixed(3) : ''}
                placeholder={preset ? (preset.costPerGbMonth / 1000).toFixed(3) : '0.023'}
                style={{ padding: '5px 8px', fontSize: 12, width: 100, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Monthly budget ($)</label>
              <input
                name="monthlyBudgetCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={repo.monthlyBudgetCents !== null && repo.monthlyBudgetCents !== undefined ? (repo.monthlyBudgetCents / 100).toFixed(2) : ''}
                placeholder="10.00"
                style={{ padding: '5px 8px', fontSize: 12, width: 100, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none' }}
              />
            </div>
            <button type="submit" style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
              Save
            </button>
          </form>
        </details>
      </div>

      {/* Escrow card */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: `1px solid ${hasEscrow ? 'color-mix(in srgb, var(--border) 60%, var(--ok) 40%)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          {hasEscrow
            ? <ShieldCheck size={16} color="var(--ok)" />
            : <ShieldAlert size={16} color="var(--warn)" />
          }
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Password escrow</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: hasEscrow ? 'var(--ok)' : 'var(--warn)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: hasEscrow
              ? 'color-mix(in srgb, transparent 85%, var(--ok) 15%)'
              : 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
            border: `1px solid ${hasEscrow
              ? 'color-mix(in srgb, transparent 70%, var(--ok) 30%)'
              : 'color-mix(in srgb, transparent 70%, var(--warn) 30%)'}`,
          }}>
            {hasEscrow ? 'Password in escrow ✓' : 'No escrow — password loss unrecoverable ⚠'}
          </span>
        </div>

        {hasEscrow ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--fg-mute)' }}>
            <span>Your repository password is safely escrowed and can be recovered with your recovery passphrase at Settings.</span>
            <form action={boundClearEscrow} style={{ flexShrink: 0 }}>
              <button type="submit" style={{
                fontSize: 12, padding: '4px 12px', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                color: 'var(--fg-mute)', background: 'var(--surf2)',
              }}>
                Remove escrow
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.5 }}>
              BackupOS can store an encrypted copy of this repository password. You can recover it using your recovery passphrase. If you lose both, the backup is unrecoverable.
            </p>
            <form action={boundSetEscrow} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Repository password</label>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="Enter your current restic password"
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Recovery passphrase (min. 8 characters)</label>
                <input
                  name="passphrase"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Choose a memorable passphrase"
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Confirm passphrase</label>
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Repeat passphrase"
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button type="submit" style={{
                fontSize: 13, padding: '7px 16px', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start',
              }}>
                Enable escrow
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
