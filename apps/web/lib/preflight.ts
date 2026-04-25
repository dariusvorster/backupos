// apps/web/lib/preflight.ts

export type CheckStatus = 'ok' | 'warning' | 'failed'

export interface CheckResult {
  id:     string
  label:  string
  status: CheckStatus
  detail: string
}

export interface PreflightInput {
  job: {
    id:           string
    sourceType:   string
    sourceConfig: string
    preHook:      string | null
    enabled:      boolean | null
  }
  agent: {
    id:         string
    name:       string
    lastSeenAt: Date | null
  } | null
  repository: {
    id:        string
    name:      string
    sizeBytes: number | null
  } | null
  recentRuns: {
    status:    string
    startedAt: Date | null
    dataAdded: number | null
  }[]
}

const AGENT_STALE_MS = 5 * 60 * 1000

export function runPreflightChecks(input: PreflightInput): CheckResult[] {
  const results: CheckResult[] = []
  const now = Date.now()

  // Agent online
  if (!input.agent) {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'failed', detail: 'No agent assigned to this job.' })
  } else if (!input.agent.lastSeenAt) {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'warning', detail: `Agent "${input.agent.name}" has never checked in.` })
  } else if (now - input.agent.lastSeenAt.getTime() > AGENT_STALE_MS) {
    const minsAgo = Math.round((now - input.agent.lastSeenAt.getTime()) / 60000)
    results.push({ id: 'agent', label: 'Agent reachable', status: 'warning', detail: `Agent "${input.agent.name}" last seen ${minsAgo} minutes ago.` })
  } else {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'ok', detail: `Agent "${input.agent.name}" is online.` })
  }

  // Source configured
  const config = (() => { try { return JSON.parse(input.job.sourceConfig) } catch { return {} } })()
  const sourceType = input.job.sourceType
  let sourceLabel: string | null = null
  if (sourceType === 'docker_volume') {
    const vols: string[] = config.volumes ?? []
    sourceLabel = vols.length > 0 ? vols.join(', ') : null
  } else {
    const paths: string[] = config.paths ?? []
    sourceLabel = paths.length > 0 ? paths[0]! + (paths.length > 1 ? ` (+${paths.length - 1} more)` : '') : null
    if (!sourceLabel) sourceLabel = config.database ?? config.shareUrl ?? config.vmId ?? null
  }
  if (!sourceLabel) {
    results.push({ id: 'source', label: 'Source configured', status: 'warning', detail: 'Source path or target not set in job config.' })
  } else {
    results.push({ id: 'source', label: 'Source configured', status: 'ok', detail: `Source: ${sourceLabel}` })
  }

  // Repository reachable
  if (!input.repository) {
    results.push({ id: 'repo', label: 'Repository reachable', status: 'failed', detail: 'No repository assigned to this job.' })
  } else {
    const lastOk = input.recentRuns.find(r => r.status === 'success')
    if (lastOk) {
      results.push({ id: 'repo', label: 'Repository reachable', status: 'ok', detail: `Repository "${input.repository.name}" — last successful run confirms access.` })
    } else {
      results.push({ id: 'repo', label: 'Repository reachable', status: 'warning', detail: `Repository "${input.repository.name}" — no recent successful run to confirm access.` })
    }
  }

  // Storage quota — repositories only have sizeBytes (no capacity ceiling in schema)
  if (!input.repository || input.repository.sizeBytes === null) {
    results.push({ id: 'quota', label: 'Storage quota', status: 'warning', detail: 'Repository size unknown — cannot estimate quota.' })
  } else {
    const lastSize = input.recentRuns.find(r => r.dataAdded !== null)?.dataAdded ?? 0
    results.push({ id: 'quota', label: 'Storage quota', status: 'ok', detail: `Repository currently uses ${fmtBytes(input.repository.sizeBytes)}; last backup added ${fmtBytes(lastSize)}.` })
  }

  // App hook prerequisites — preHook column
  const hooks = (() => { try { return input.job.preHook ? JSON.parse(input.job.preHook) : null } catch { return null } })()
  const needsHook = ['mysql', 'postgresql'].includes(input.job.sourceType)
  if (needsHook && !hooks) {
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'warning', detail: `Source type "${input.job.sourceType}" typically requires a pre-backup hook (e.g. pg_dump). None configured.` })
  } else if (hooks) {
    const hookDesc = typeof hooks === 'string' ? hooks : (hooks.command ?? JSON.stringify(hooks))
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'ok', detail: `Pre-backup hook configured: ${hookDesc}` })
  } else {
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'ok', detail: 'No app hooks required for this source type.' })
  }

  return results
}

export function overallStatus(results: CheckResult[]): CheckStatus {
  if (results.some(r => r.status === 'failed'))  return 'failed'
  if (results.some(r => r.status === 'warning')) return 'warning'
  return 'ok'
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export const CHECKS_SKELETON: { id: string; label: string }[] = [
  { id: 'agent',  label: 'Agent reachable' },
  { id: 'source', label: 'Source configured' },
  { id: 'repo',   label: 'Repository reachable' },
  { id: 'quota',  label: 'Storage quota' },
  { id: 'hooks',  label: 'App hook prerequisites' },
]
