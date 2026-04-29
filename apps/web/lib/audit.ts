import { createHash, randomUUID } from 'crypto'
import { getDb, auditLog }        from '@backupos/db'
import { desc }                   from '@backupos/db'

export type AuditAction =
  | 'job.created'    | 'job.updated'    | 'job.deleted'   | 'job.run'
  | 'repo.created'   | 'repo.updated'   | 'repo.deleted'
  | 'agent.enrolled' | 'agent.deleted'
  | 'snapshot.pinned' | 'snapshot.tagged' | 'snapshot.held' | 'snapshot.deleted'
  | 'user.login'     | 'user.logout'    | 'user.password_changed'
  | 'totp.enabled'   | 'totp.disabled'  | 'backup_code.redeemed'
  | 'session.created'| 'session.revoked'
  | 'escrow.accessed'
  | 'api_token.created' | 'api_token.revoked'
  | 'settings.updated'
  | 'user.created'
  | 'user.role_changed'

function canonical(fields: {
  action: string; resourceType: string; resourceId?: string | null;
  actor?: string | null; createdAt: Date; prevHash?: string | null
}): string {
  return [
    fields.action,
    fields.resourceType,
    fields.resourceId  ?? '',
    fields.actor       ?? 'system',
    fields.createdAt.toISOString(),
    fields.prevHash    ?? '',
  ].join('|')
}

export function appendAuditEntry(input: {
  action:        AuditAction
  resourceType:  string
  resourceId?:   string
  resourceName?: string
  actor?:        string
  detail?:       Record<string, unknown>
}): void {
  const db   = getDb()
  const last = db.select({ hash: auditLog.hash }).from(auditLog)
    .orderBy(desc(auditLog.createdAt)).limit(1).get()

  const prevHash  = last?.hash ?? null
  const createdAt = new Date()
  const hash      = createHash('sha256').update(canonical({ ...input, prevHash, createdAt })).digest('hex')

  db.insert(auditLog).values({
    id:           randomUUID(),
    action:       input.action,
    resourceType: input.resourceType,
    resourceId:   input.resourceId   ?? null,
    resourceName: input.resourceName ?? null,
    actor:        input.actor        ?? 'system',
    detail:       input.detail ? JSON.stringify(input.detail) : null,
    prevHash,
    hash,
    createdAt,
  }).run()
}

export function verifyAuditChain(): { ok: boolean; brokenAt?: string; checkedCount: number } {
  const db      = getDb()
  const entries = db.select().from(auditLog).orderBy(auditLog.createdAt).all()

  let prevHash: string | null = null
  for (const entry of entries) {
    if (!entry.hash) { prevHash = null; continue } // legacy rows without hash
    const expected: string = createHash('sha256').update(canonical({ ...entry, prevHash })).digest('hex')
    if (entry.hash !== expected) {
      return { ok: false, brokenAt: entry.id, checkedCount: entries.length }
    }
    prevHash = entry.hash
  }
  return { ok: true, checkedCount: entries.length }
}
