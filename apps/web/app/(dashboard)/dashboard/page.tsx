import type { ComponentProps } from 'react'
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  verificationTests, verificationRuns, bandwidthProfiles, bandwidthRules, infraOsServices,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardLink, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
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

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
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

function fmtIn(d: Date): string {
  const ms = d.getTime() - Date.now()
  if (ms < 60_000) return 'soon'
  if (ms < 3_600_000) return `in ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `in ${Math.floor(ms / 3_600_000)}h`
  return `in ${Math.floor(ms / 86_400_000)}d`
}

export default async function DashboardPage() {
  const db      = getDb()
  const now     = Date.now()
  const since24h  = new Date(now - 24  * 60 * 60 * 1000)
  const since7d   = new Date(now -  7  * 24 * 60 * 60 * 1000)
  const since30d  = new Date(now - 30  * 24 * 60 * 60 * 1000)

  const [jobs, recentRuns, allAgents, repos, successRuns24h, openAlerts, runs30d, passedVerifications7d, allServices, upcomingJobs] =
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
      db.select({
        id:          infraOsServices.id,
        name:        infraOsServices.name,
        serviceType: infraOsServices.serviceType,
        host:        infraOsServices.host,
        description: infraOsServices.description,
      }).from(infraOsServices).all(),

      db.select({
        id:        backupJobs.id,
        name:      backupJobs.name,
        nextRunAt: backupJobs.nextRunAt,
      })
        .from(backupJobs)
        .where(and(
          eq(backupJobs.enabled, true),
          gte(backupJobs.nextRunAt, new Date()),
        ))
        .orderBy(backupJobs.nextRunAt)
        .limit(5)
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

  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* Health score */}
      <HealthScoreCard
        score={healthScore.score}
        grade={healthScore.grade}
        gradeColor={healthScore.gradeColor}
        factors={healthScore.factors}
        sparkline={sparkline}
      />

      {/* Stat row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 16,
        marginTop: 16,
      }}>
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

      {/* Services without backups warning */}
      {uncoveredServices.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--border) 60%, var(--warn) 40%)' }}>
          <CardHeader>
            <CardTitle>Services without backups</CardTitle>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--warn)',
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--warn-dim)',
            }}>
              {uncoveredServices.length} unprotected
            </span>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {uncoveredServices.map((svc, i) => {
              const sourceType = SOURCE_TYPE_MAP[svc.serviceType] ?? 'filesystem'
              const href = `/jobs/new?name=${encodeURIComponent(svc.name)}&sourceType=${encodeURIComponent(sourceType)}&infraServiceId=${encodeURIComponent(svc.id)}`
              return (
                <div key={svc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border2)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {svc.serviceType}{svc.host ? ` · ${svc.host}` : ''}{svc.description ? ` · ${svc.description}` : ''}
                    </div>
                  </div>
                  <a href={href} style={{
                    fontSize: 12, padding: '4px 12px',
                    borderRadius: 'var(--radius-sm)', border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-fg)',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}>
                    Create job →
                  </a>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {/* Two-column card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 16 }}>

        {/* Recent runs card */}
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardLink href="/activity">View all →</CardLink>
          </CardHeader>
          {recentRuns.length === 0 ? (
            <CardBody>
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
                No backup runs yet.
              </div>
            </CardBody>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Status', 'Job', 'Duration', 'Size', 'Age'].map((h, i) => (
                    <th key={h} style={{
                      padding: '8px 16px', textAlign: i > 1 ? 'right' : 'left',
                      fontSize: 10, fontWeight: 600, color: 'var(--fg-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      backgroundColor: 'var(--surf2)',
                      borderBottom: '1px solid var(--border2)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRuns.map(run => (
                  <tr key={run.id} style={{ borderTop: '1px solid var(--border2)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge status={toBadge(run.status)} />
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
                      {run.jobName ?? run.jobId ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtDuration(run.duration)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtBytes(run.dataAdded)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtAge(run.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Right column: Agents + Bandwidth stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Agents card */}
          <Card>
            <CardHeader>
              <CardTitle>Agents</CardTitle>
              <CardLink href="/agents">Manage →</CardLink>
            </CardHeader>
            {allAgents.length === 0 ? (
              <CardBody>
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
                  No agents enrolled
                </div>
              </CardBody>
            ) : (
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allAgents.map(agent => (
                  <div key={agent.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{agent.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>
                        {agent.hostname ?? agent.ip ?? '—'}
                      </div>
                    </div>
                    <Badge status={toBadge(agent.status ?? 'disconnected')} />
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          {/* Coming up card */}
          <Card>
            <CardHeader>
              <CardTitle>Coming up</CardTitle>
              <CardLink href="/activity">View all →</CardLink>
            </CardHeader>
            {upcomingJobs.length === 0 ? (
              <CardBody>
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
                  No scheduled jobs queued.
                </div>
              </CardBody>
            ) : (
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingJobs.map(job => (
                  <div key={job.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <a href={`/jobs/${job.id}`} style={{
                      fontSize: 13, fontWeight: 500, color: 'var(--fg)',
                      textDecoration: 'none', flex: 1, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {job.name}
                    </a>
                    {job.nextRunAt && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                        {fmtIn(job.nextRunAt)}
                      </span>
                    )}
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          {/* Bandwidth card */}
          <Card>
            <CardHeader>
              <CardTitle>Bandwidth (global)</CardTitle>
              <CardLink href="/settings/bandwidth">Configure →</CardLink>
            </CardHeader>
            <CardBody>
              {globalProfile ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', marginBottom: 2, letterSpacing: '-0.02em' }}>
                    {fmtLimit(currentLimit)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 10 }}>
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
                            <rect key={h} x={x} y={H - barH} width={BAR_W} height={barH}
                              fill={fill} opacity={h === currentHour ? 1 : 0.45} rx={1} />
                          )
                        })}
                      </svg>
                    )
                  })()}
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                  No global profile.{' '}
                  <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Configure one.</a>
                </div>
              )}
            </CardBody>
          </Card>

        </div>
      </div>
    </div>
  )
}
