export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }                                              from 'next/server'
import { getDb, agents, repositories, backupMonitors, backupRuns } from '@backupos/db'
import { desc }                                                                   from '@backupos/db'
import { authenticate }                                                           from '@/lib/integration-auth'

type HealthStatus = 'green' | 'yellow' | 'red' | 'unknown'

function worst(...statuses: HealthStatus[]): HealthStatus {
  const rank: Record<HealthStatus, number> = { red: 3, yellow: 2, green: 1, unknown: 0 }
  return statuses.reduce((a, b) => rank[a] >= rank[b] ? a : b)
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'health:read')
  if (auth instanceof NextResponse) return auth

  const db = getDb()

  // Agents check
  const allAgents    = db.select().from(agents).all()
  const onlineAgents = allAgents.filter(a => a.status === 'online').length
  const agentStatus: HealthStatus = allAgents.length === 0
    ? 'unknown'
    : onlineAgents === 0                    ? 'red'
    : onlineAgents < allAgents.length       ? 'yellow'
    : 'green'

  // Recent runs check — any failed in last 24 h?
  const cutoff     = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentRuns = db.select().from(backupRuns)
    .orderBy(desc(backupRuns.startedAt))
    .limit(100)
    .all()
    .filter(r => r.startedAt >= cutoff)
  const failedRecent = recentRuns.filter(r => r.status === 'failed').length
  const jobsStatus: HealthStatus = recentRuns.length === 0
    ? 'unknown'
    : failedRecent > 0 ? 'red' : 'green'

  // Repositories check
  // last_check_status values: 'ok' (success), null/'' (never checked), anything else (failure)
  const allRepos       = db.select().from(repositories).all()
  const checkedRepos   = allRepos.filter(r => r.lastCheckStatus !== null && r.lastCheckStatus !== '')
  const failedRepos    = checkedRepos.filter(r => r.lastCheckStatus !== 'ok').length
  const uncheckedRepos = allRepos.filter(r => !r.lastCheckStatus).length
  const repoStatus: HealthStatus = allRepos.length === 0
    ? 'unknown'
    : failedRepos > 0    ? 'red'
    : uncheckedRepos > 0 ? 'yellow'
    : 'green'

  // Monitors check
  // backup_monitors.status values: 'unknown' (default), 'failed', or 'success'
  const allMonitors     = db.select().from(backupMonitors).all()
  const failedMonitors  = allMonitors.filter(m => m.status === 'failed').length
  const unknownMonitors = allMonitors.filter(m => m.status === 'unknown' || !m.status).length
  const monitorStatus: HealthStatus = allMonitors.length === 0
    ? 'unknown'
    : failedMonitors > 0  ? 'red'
    : unknownMonitors > 0 ? 'yellow'
    : 'green'

  const overall = worst(agentStatus, jobsStatus, repoStatus, monitorStatus)

  return NextResponse.json({
    status: overall,
    checks: {
      agents:       { status: agentStatus,   online: onlineAgents,   total: allAgents.length },
      recent_jobs:  { status: jobsStatus,    failed_24h: failedRecent, checked: recentRuns.length },
      repositories: { status: repoStatus,    failed_count: failedRepos, unchecked_count: uncheckedRepos, total: allRepos.length },
      monitors:     { status: monitorStatus, failed_count: failedMonitors, unknown_count: unknownMonitors, total: allMonitors.length },
    },
    retrieved_at: new Date().toISOString(),
  })
}
