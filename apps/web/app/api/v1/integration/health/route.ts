export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }                          from 'next/server'
import { getDb, agents, backupJobs, repositories, backupMonitors, backupRuns } from '@backupos/db'
import { desc }                                               from '@backupos/db'
import { authenticate }                                       from '@/lib/integration-auth'

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

function worst(...statuses: HealthStatus[]): HealthStatus {
  const rank: Record<HealthStatus, number> = { error: 3, warning: 2, healthy: 1, unknown: 0 }
  return statuses.reduce((a, b) => rank[a] >= rank[b] ? a : b)
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'health:read')
  if (auth instanceof NextResponse) return auth

  const db = getDb()

  // Agents check
  const allAgents      = db.select().from(agents).all()
  const onlineAgents   = allAgents.filter(a => a.status === 'online').length
  const agentStatus: HealthStatus = allAgents.length === 0
    ? 'unknown'
    : onlineAgents === 0 ? 'error' : onlineAgents < allAgents.length ? 'warning' : 'healthy'

  // Recent jobs check — any failed in last 24 h?
  const cutoff        = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentRuns    = db.select().from(backupRuns)
    .orderBy(desc(backupRuns.startedAt))
    .limit(100)
    .all()
    .filter(r => r.startedAt >= cutoff)
  const failedRecent  = recentRuns.filter(r => r.status === 'failed').length
  const jobsStatus: HealthStatus = recentRuns.length === 0
    ? 'unknown'
    : failedRecent > 0 ? 'error' : 'healthy'

  // Repositories check
  const allRepos   = db.select().from(repositories).all()
  const errorRepos = allRepos.filter(r => r.lastCheckStatus === 'errors').length
  const repoStatus: HealthStatus = allRepos.length === 0
    ? 'unknown'
    : errorRepos > 0 ? 'error' : 'healthy'

  // Monitors check
  const allMonitors    = db.select().from(backupMonitors).all()
  const errMonitors    = allMonitors.filter(m => m.status === 'error').length
  const warnMonitors   = allMonitors.filter(m => m.status === 'warning').length
  const monitorStatus: HealthStatus = allMonitors.length === 0
    ? 'unknown'
    : errMonitors > 0 ? 'error' : warnMonitors > 0 ? 'warning' : 'healthy'

  const overall = worst(agentStatus, jobsStatus, repoStatus, monitorStatus)

  return NextResponse.json({
    status:     overall,
    checks: {
      agents:      { status: agentStatus,   online: onlineAgents, total: allAgents.length },
      recent_jobs: { status: jobsStatus,    failed_24h: failedRecent, checked: recentRuns.length },
      repositories: { status: repoStatus,  error_count: errorRepos, total: allRepos.length },
      monitors:    { status: monitorStatus, error_count: errMonitors, warning_count: warnMonitors, total: allMonitors.length },
    },
    retrieved_at: new Date().toISOString(),
  })
}
