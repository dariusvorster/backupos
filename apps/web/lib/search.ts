import {
  getDb,
  backupJobs,
  repositories,
  agents,
  snapshots,
  restoreSpecs,
  alertRules,
  auditLog,
  backupMonitors,
  or,
} from '@backupos/db'
import { like } from 'drizzle-orm'

export type ResultType =
  | 'job'
  | 'repository'
  | 'agent'
  | 'snapshot'
  | 'restoreSpec'
  | 'monitor'
  | 'alertRule'
  | 'auditEvent'

export interface SearchResult {
  type:     ResultType
  id:       string
  label:    string
  sublabel: string
  url:      string
}

export async function searchAll(query: string): Promise<SearchResult[]> {
  if (query.trim().length < 2) return []
  const q  = `%${query.trim()}%`
  const db = getDb()
  const results: SearchResult[] = []

  const [jobs, repos, agentRows, snaps, specs, monitors, alerts, events] = await Promise.all([
    db.select({ id: backupJobs.id, name: backupJobs.name, sourceType: backupJobs.sourceType })
      .from(backupJobs)
      .where(or(like(backupJobs.name, q), like(backupJobs.sourceType, q)))
      .limit(5).all(),

    db.select({ id: repositories.id, name: repositories.name, backend: repositories.backend })
      .from(repositories)
      .where(or(like(repositories.name, q), like(repositories.backend, q)))
      .limit(5).all(),

    db.select({ id: agents.id, name: agents.name, hostname: agents.hostname })
      .from(agents)
      .where(or(like(agents.name, q), like(agents.hostname, q)))
      .limit(5).all(),

    db.select({ id: snapshots.id, hostname: snapshots.hostname, repositoryId: snapshots.repositoryId })
      .from(snapshots)
      .where(like(snapshots.hostname, q))
      .limit(5).all(),

    db.select({ id: restoreSpecs.id, name: restoreSpecs.name, description: restoreSpecs.description })
      .from(restoreSpecs)
      .where(or(like(restoreSpecs.name, q), like(restoreSpecs.description, q)))
      .limit(5).all(),

    db.select({ id: backupMonitors.id, name: backupMonitors.name })
      .from(backupMonitors)
      .where(like(backupMonitors.name, q))
      .limit(5).all(),

    db.select({ id: alertRules.id, name: alertRules.name, type: alertRules.type })
      .from(alertRules)
      .where(or(like(alertRules.name, q), like(alertRules.type, q)))
      .limit(5).all(),

    db.select({ id: auditLog.id, action: auditLog.action, resourceType: auditLog.resourceType, resourceName: auditLog.resourceName })
      .from(auditLog)
      .where(or(like(auditLog.action, q), like(auditLog.resourceName, q)))
      .limit(5).all(),
  ])

  for (const j of jobs)      results.push({ type: 'job',         id: j.id,         label: j.name,            sublabel: `Job · ${j.sourceType ?? ''}`,                          url: `/jobs/${j.id}` })
  for (const r of repos)     results.push({ type: 'repository',  id: r.id,         label: r.name,            sublabel: `Repository · ${r.backend ?? ''}`,                      url: `/repositories/${r.id}` })
  for (const a of agentRows) results.push({ type: 'agent',       id: a.id,         label: a.name,            sublabel: `Agent · ${a.hostname ?? ''}`,                          url: `/agents/${a.id}` })
  for (const s of snaps)     results.push({ type: 'snapshot',    id: s.id,         label: s.id.slice(0, 12), sublabel: `Snapshot · ${s.hostname ?? ''}`,                       url: `/snapshots` })
  for (const s of specs)     results.push({ type: 'restoreSpec', id: s.id,         label: s.name,            sublabel: `Restore spec · ${s.description ?? ''}`,               url: `/restore/${s.id}` })
  for (const m of monitors)  results.push({ type: 'monitor',     id: m.id,         label: m.name,            sublabel: 'Monitor',                                              url: `/monitors/${m.id}` })
  for (const a of alerts)    results.push({ type: 'alertRule',   id: a.id,         label: a.name,            sublabel: `Alert rule · ${a.type ?? ''}`,                         url: `/alerts/${a.id}` })
  for (const e of events)    results.push({ type: 'auditEvent',  id: String(e.id), label: e.action,          sublabel: `${e.resourceType} · ${e.resourceName ?? ''}`,          url: `/audit` })

  return results
}
