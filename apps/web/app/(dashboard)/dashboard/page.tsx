import type { ComponentProps } from 'react'
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  verificationTests, verificationRuns, bandwidthProfiles, bandwidthRules, infraOsServices,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { HealthScoreCard } from '@/components/ui/health-score-card'
import { computeHealthScore, buildSparkline } from '@/lib/health-score'
import { build24hSparklineValues, fmtLimit, getActiveRule, UNLIMITED_KBPS } from '@/lib/bandwidth'
import type { BandwidthRule } from '@/lib/bandwidth'

type BadgeStatus = ComponentProps<typeof Badge>['status']

const VALID_STATUSES = new Set<string>([
  'healthy', 'success', 'connected', 'online', 'running',
  'warning', 'missed', 'failed', 'error', 'disconnected',
  'offline', 'idle', 'paused', 'verifying',
])

function toBadge(s: string): BadgeStatus {
  return VALID_STATUSES.has(s) ? (s as BadgeStatus) : 'idle'
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtAge(d: Date | null): string {
  if (!d) return '—'
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default async function DashboardPage() {
  const db      = getDb()
  const now     = Date.now()
  const since24h  = new Date(now - 24  * 60 * 60 * 1000)
  const since7d   = new Date(now -  7  * 24 * 60 * 60 * 1000)
  const since30d  = new Date(now - 30  * 24 * 60 * 60 * 1000)

  const [jobs, recentRuns, allAgents, repos, successRuns24h, openAlerts, runs30d, passedVerifications7d] =
    await Promise.all([
      db.select().from(backupJobs).all(),
      db.select({
        id:        backupRuns.id,
        jobId:     backupRuns.jobId,
        jobName:   backupJobs.name,
        status:    backupRuns.status,
        startedAt: backupRuns.startedAt,
        duration:  backupRuns.duration,
        dataAdded: backupRuns.dataAdded,
      })
        .from(backupRuns)
        .leftJoin(backupJobs, eq(backupRuns.jobId, backupJobs.id))
        .orderBy(desc(backupRuns.startedAt))
        .limit(20)
        .all(),
      db.select().from(agents).all(),
      db.select().from(repositories).all(),
      db.select({ jobId: backupRuns.jobId })
        .from(backupRuns)
        .innerJoin(backupJobs, and(eq(backupRuns.jobId, backupJobs.id), eq(backupJobs.enabled, true)))
        .where(and(eq(backupRuns.status, 'success'), gte(backupRuns.startedAt, since24h)))
        .all(),
      db.select({ id: storageAlerts.id })
        .from(storageAlerts)
        .where(isNull(storageAlerts.resolvedAt))
        .all(),
      db.select({ status: backupRuns.status, startedAt: backupRuns.startedAt })
        .from(backupRuns)
        .where(gte(backupRuns.startedAt, since30d))
        .all(),
      db.select({ jobId: verificationTests.jobId })
        .from(verificationRuns)
        .innerJoin(verificationTests, eq(verificationRuns.testId, verificationTests.id))
        .where(and(
          eq(verificationRuns.status, 'passed'),
          gte(verificationRuns.startedAt, since7d),
        ))
        .all(),
    ])

  const runs24h      = recentRuns.filter(r => r.startedAt && r.startedAt >= since24h)
  const failed24h    = runs24h.filter(r => r.status === 'failed').length
  const agentsOnline = allAgents.filter(a => a.status === 'connected').length

  const enabledJobs          = jobs.filter(j => j.enabled).length
  const jobsWithSuccess24h   = new Set(successRuns24h.map(r => r.jobId)).size
  const reposWithRecentCheck = repos.filter(
    r => r.lastCheckStatus === 'ok' && r.lastCheckedAt !== null && r.lastCheckedAt >= since7d,
  ).length

  const verifiedJobIds = new Set(passedVerifications7d.map(r => r.jobId).filter(Boolean))
  const verifiedPct    = enabledJobs === 0
    ? 100
    : Math.min(100, Math.round((verifiedJobIds.size / enabledJobs) * 100))

  const coveredInfraServiceIds = new Set(
    jobs.map(j => j.infraServiceId).filter((id): id is string => id !== null && id !== undefined)
  )
  const allServices = await db.select({
    id:          infraOsServices.id,
    name:        infraOsServices.name,
    serviceType: infraOsServices.serviceType,
    host:        infraOsServices.host,
    description: infraOsServices.description,
  }).from(infraOsServices).all()
  const coveredInfraServices = allServices.filter(s => coveredInfraServiceIds.has(s.id)).length

  const healthScore = computeHealthScore({
    enabledJobs,
    jobsWithSuccessIn24h: jobsWithSuccess24h,
    totalRepos: repos.length,
    reposWithRecentCheck,
    totalAgents: allAgents.length,
    onlineAgents: agentsOnline,
    openAlerts: openAlerts.length,
    verifiedJobs: verifiedJobIds.size,
    totalInfraServices: allServices.length,
    coveredInfraServices,
  })
  const sparkline = buildSparkline(runs30d)

  const globalProfile = await db.select()
    .from(bandwidthProfiles)
    .where(eq(bandwidthProfiles.isGlobal, true))
    .limit(1)
    .then(r => r[0] ?? null)

  const globalRules: BandwidthRule[] = globalProfile
    ? await db.select()
        .from(bandwidthRules)
        .where(eq(bandwidthRules.profileId, globalProfile.id))
        .all()
    : []

  const currentHour  = new Date().getHours()
  const activeRule   = getActiveRule(globalRules, currentHour)
  const currentLimit = activeRule?.limitKbps ?? null
  const sparkValues  = build24hSparklineValues(globalRules)

  const uncoveredServices = allServices.filter(s => !coveredInfraServiceIds.has(s.id))

  const SOURCE_TYPE_MAP: Record<string, string> = {
    database:   'database',
    filesystem: 'filesystem',
    container:  'docker_volume',
  }

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Dashboard</h1>

      {/* Health score hero */}
      <HealthScoreCard
        score={healthScore.score}
        grade={healthScore.grade}
        gradeColor={healthScore.gradeColor}
        factors={healthScore.factors}
        sparkline={sparkline}
      />

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Backup jobs"  value={jobs.length} />
        <StatCard label="Repositories" value={repos.length} />
        <StatCard label="Agents"       value={allAgents.length} footer={`${agentsOnline} online`} />
        <StatCard
          label="Runs (24 h)"
          value={runs24h.length}
          delta={failed24h > 0
            ? { text: `${failed24h} failed`, direction: 'down' }
            : runs24h.length > 0 ? { text: 'all ok', direction: 'up' } : undefined}
        />
        <StatCard
          label="Verified (7d)"
          value={`${verifiedPct}%`}
          footer={`${verifiedJobIds.size} / ${enabledJobs} jobs`}
          delta={verifiedPct < 80
            ? { text: 'below 80% target', direction: 'down' }
            : { text: 'on target', direction: 'up' }}
        />
      </div>

      {/* Bandwidth widget */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 32,
      }}>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Bandwidth (global)
        </div>
        {globalProfile ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
              {fmtLimit(currentLimit)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 12 }}>
              {globalProfile.name} · now ({currentHour}:00)
            </div>
            {(() => {
              const W = 168, H = 28, BAR_W = 6, GAP = 1
              return (
                <svg width={W} height={H}>
                  {sparkValues.map((v, h) => {
                    const barH = Math.max(3, Math.round((v / UNLIMITED_KBPS) * H))
                    const x    = h * (BAR_W + GAP)
                    const fill = v >= UNLIMITED_KBPS ? 'var(--ok)' : 'var(--warn)'
                    return (
                      <rect
                        key={h} x={x} y={H - barH}
                        width={BAR_W} height={barH}
                        fill={fill} opacity={h === currentHour ? 1 : 0.55} rx={1}
                      />
                    )
                  })}
                </svg>
              )
            })()}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
            No global profile set.{' '}
            <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Configure one.</a>
          </div>
        )}
      </div>

      {/* Services without backups */}
      {uncoveredServices.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, var(--warn) 40%)',
          borderRadius: 'var(--radius)',
          marginBottom: 32,
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>Services without backups</span>
            <span style={{
              fontSize: 12, fontWeight: 500, color: 'var(--warn)',
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
              border: '1px solid color-mix(in srgb, transparent 70%, var(--warn) 30%)',
            }}>
              {uncoveredServices.length} unprotected
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {uncoveredServices.map((svc, i) => {
              const sourceType = SOURCE_TYPE_MAP[svc.serviceType] ?? 'filesystem'
              const href = `/jobs/new?name=${encodeURIComponent(svc.name)}&sourceType=${encodeURIComponent(sourceType)}&infraServiceId=${encodeURIComponent(svc.id)}`
              return (
                <div key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                    </div>
                  </div>
                  <a
                    href={href}
                    style={{
                      fontSize: 12, padding: '4px 12px',
                      borderRadius: 'var(--radius-sm)', border: 'none',
                      background: 'var(--accent)', color: '#fff', textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Create job →
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent runs table */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 24,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Recent runs
        </div>
        {recentRuns.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No backup runs yet. Enrol an agent to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Job</th>
                <th style={thR}>Duration</th>
                <th style={thR}>Size added</th>
                <th style={thR}>Age</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={toBadge(run.status)} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--fg)' }}>
                    {run.jobName ?? run.jobId ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.duration)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtBytes(run.dataAdded)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtAge(run.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agents card */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Agents
        </div>
        {allAgents.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No agents enrolled — install an agent to start backing up
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, padding: 16 }}>
            {allAgents.map(agent => (
              <div key={agent.id} style={{
                backgroundColor: 'var(--surf2)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  {agent.hostname ?? agent.ip ?? '—'}
                </div>
                <Badge status={toBadge(agent.status ?? 'disconnected')} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
