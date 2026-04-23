'use server'

import { getDb, auditLog }  from '@backupos/db'
import { desc, eq, and, like } from '@backupos/db'
import { verifyAuditChain } from '@/lib/audit'

export interface AuditFilters {
  actor?:        string
  resourceType?: string
  action?:       string
  search?:       string
}

export interface AuditEntry {
  id:           string
  action:       string
  resourceType: string
  resourceId:   string | null
  resourceName: string | null
  actor:        string | null
  detail:       string | null
  hash:         string | null
  createdAt:    Date
}

export async function getAuditPage(filters: AuditFilters = {}, limit = 200): Promise<AuditEntry[]> {
  const db         = getDb()
  const conditions = []
  if (filters.actor)        conditions.push(eq(auditLog.actor,        filters.actor))
  if (filters.resourceType) conditions.push(eq(auditLog.resourceType, filters.resourceType))
  if (filters.action)       conditions.push(eq(auditLog.action,       filters.action))

  const query = conditions.length > 0
    ? db.select().from(auditLog).where(and(...conditions)).orderBy(desc(auditLog.createdAt)).limit(limit * 2)
    : db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit * 2)

  const rows = await query.all()

  return rows
    .filter(r => !filters.search || `${r.action} ${r.resourceName ?? ''} ${r.actor ?? ''}`
        .toLowerCase().includes(filters.search.toLowerCase()))
    .slice(0, limit)
    .map(r => ({ ...r, createdAt: r.createdAt ?? new Date(0) }))
}

export async function getForensicTimeline(actor: string): Promise<AuditEntry[]> {
  const db   = getDb()
  const rows = await db.select().from(auditLog)
    .where(like(auditLog.actor, `%${actor}%`))
    .orderBy(auditLog.createdAt)
    .all()
  return rows.map(r => ({ ...r, createdAt: r.createdAt ?? new Date(0) }))
}

export async function checkAuditIntegrity(): Promise<{ ok: boolean; brokenAt?: string; checkedCount: number }> {
  return verifyAuditChain()
}

function csvCell(v: string): string {
  const escaped = v.replace(/"/g, '""')
  // Prefix formula starters to prevent spreadsheet injection
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped
  return `"${safe}"`
}

export async function exportAuditLog(filters: AuditFilters, format: 'csv' | 'jsonl'): Promise<string> {
  const rows = await getAuditPage(filters, 100_000)
  if (format === 'jsonl') return rows.map(r => JSON.stringify(r)).join('\n')
  const header = '"id","action","resource_type","resource_name","actor","created_at"'
  const body   = rows.map(r =>
    [csvCell(r.id), csvCell(r.action), csvCell(r.resourceType),
     csvCell(r.resourceName ?? ''), csvCell(r.actor ?? ''), csvCell(r.createdAt.toISOString())].join(',')
  )
  return [header, ...body].join('\n')
}
