import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { auditLog } from '@backupos/db'

type AnyDb = BetterSQLite3Database<Record<string, unknown>>

export async function appendAuditEntry(
  db: AnyDb,
  opts: {
    action: string
    resourceType: string
    resourceId?: string
    resourceName?: string
    actor?: string
    detail?: string
  },
): Promise<void> {
  await db.insert(auditLog).values({
    id:           crypto.randomUUID(),
    action:       opts.action,
    resourceType: opts.resourceType,
    resourceId:   opts.resourceId,
    resourceName: opts.resourceName,
    actor:        opts.actor ?? 'system',
    detail:       opts.detail,
    createdAt:    new Date(),
  })
}
