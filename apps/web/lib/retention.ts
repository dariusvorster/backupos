import { loggingConfig, alerts, auditLog, operationalLogs, lt, inArray } from '@backupos/db'
import type { Db } from '@backupos/db'

/**
 * Parse retention strings into milliseconds.
 *  '90d'     → 90 * 86_400_000
 *  '3y'      → 3 * 365 * 86_400_000
 *  'forever' → null (caller skips pruning)
 *
 * Throws on malformed input — caller should treat as a config error
 * and skip that log type's sweep, not crash the whole tick.
 */
export function parseRetention(s: string): number | null {
  if (s === 'forever') return null
  const m = s.match(/^(\d+)([dy])$/)
  if (!m) throw new Error(`Invalid retention value: ${s}`)
  const n = Number(m[1])
  const unit = m[2]
  return unit === 'd' ? n * 86_400_000 : n * 365 * 86_400_000
}

export interface SweepResult {
  alerts: number
  audit:  number
  ops:    number
  errors: { table: string; message: string }[]
}

const BATCH_SIZE = 10_000
const CHUNK_SIZE = 999 // stay under SQLite SQLITE_LIMIT_VARIABLE_NUMBER

async function deleteOlderThan(
  selectBatch: () => string[],
  deleteBatch: (ids: string[]) => void,
): Promise<number> {
  let total = 0
  while (true) {
    const ids = selectBatch()
    if (ids.length === 0) break
    total += ids.length
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      deleteBatch(ids.slice(i, i + CHUNK_SIZE))
    }
    if (ids.length < BATCH_SIZE) break
    await new Promise(r => setTimeout(r, 50))
  }
  return total
}

export async function pruneRetainedLogs(db: Db): Promise<SweepResult> {
  const result: SweepResult = { alerts: 0, audit: 0, ops: 0, errors: [] }

  const row = db.select().from(loggingConfig).get()
  if (!row) {
    console.warn('[retention] No logging_config row — skipping sweep')
    return result
  }

  const now = Date.now()

  // activityRetention → alerts.firedAt
  try {
    const ms = parseRetention(row.activityRetention)
    if (ms !== null) {
      const cutoff = new Date(now - ms)
      result.alerts = await deleteOlderThan(
        () => db.select({ id: alerts.id }).from(alerts).where(lt(alerts.firedAt, cutoff)).limit(BATCH_SIZE).all().map(r => r.id),
        (ids) => { db.delete(alerts).where(inArray(alerts.id, ids)).run() },
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[retention] Skipping alerts: ${message}`)
    result.errors.push({ table: 'alerts', message })
  }

  // auditRetention → audit_log.createdAt
  try {
    const ms = parseRetention(row.auditRetention)
    if (ms !== null) {
      const cutoff = new Date(now - ms)
      result.audit = await deleteOlderThan(
        () => db.select({ id: auditLog.id }).from(auditLog).where(lt(auditLog.createdAt, cutoff)).limit(BATCH_SIZE).all().map(r => r.id),
        (ids) => { db.delete(auditLog).where(inArray(auditLog.id, ids)).run() },
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[retention] Skipping audit_log: ${message}`)
    result.errors.push({ table: 'audit_log', message })
  }

  // opsRetention → logs.createdAt
  try {
    const ms = parseRetention(row.opsRetention)
    if (ms !== null) {
      const cutoff = new Date(now - ms)
      result.ops = await deleteOlderThan(
        () => db.select({ id: operationalLogs.id }).from(operationalLogs).where(lt(operationalLogs.createdAt, cutoff)).limit(BATCH_SIZE).all().map(r => r.id),
        (ids) => { db.delete(operationalLogs).where(inArray(operationalLogs.id, ids)).run() },
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[retention] Skipping logs: ${message}`)
    result.errors.push({ table: 'logs', message })
  }

  try {
    db.update(loggingConfig).set({
      lastSweepAt: new Date(),
      lastSweepDeletedAlerts: result.alerts,
      lastSweepDeletedAudit: result.audit,
      lastSweepDeletedOps: result.ops,
    }).run()
  } catch (err) {
    console.warn('[retention] Failed to update lastSweepAt:', err instanceof Error ? err.message : String(err))
  }

  const parts = [`Retention sweep: deleted ${result.alerts} alerts, ${result.audit} audit entries, ${result.ops} operational logs`]
  if (result.errors.length > 0) {
    parts.push(`Errors: ${result.errors.map(e => `${e.table}: ${e.message}`).join('; ')}`)
  }

  db.insert(auditLog).values({
    id: crypto.randomUUID(),
    action: 'retention_sweep',
    resourceType: 'system',
    actor: 'system',
    detail: parts.join('. '),
    createdAt: new Date(),
  }).run()

  return result
}
