'use server'

import { getDb, auditLog }  from '@backupos/db'
import { desc }             from 'drizzle-orm'
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
  const db   = getDb()
  const rows = await db.select().from(auditLog)
    .orderBy(desc(auditLog.createdAt)).limit(limit * 5).all()

  return rows
    .filter(r => {
      if (filters.actor        && r.actor        !== filters.actor)        return false
      if (filters.resourceType && r.resourceType !== filters.resourceType) return false
      if (filters.action       && r.action       !== filters.action)       return false
      if (filters.search && !`${r.action} ${r.resourceName ?? ''} ${r.actor ?? ''}`
          .toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
    .slice(0, limit)
    .map(r => ({ ...r, createdAt: r.createdAt! }))
}

export async function getForensicTimeline(actor: string): Promise<AuditEntry[]> {
  const db   = getDb()
  const rows = await db.select().from(auditLog).orderBy(auditLog.createdAt).all()
  return rows
    .filter(r => (r.actor ?? 'system').toLowerCase().includes(actor.toLowerCase()))
    .map(r => ({ ...r, createdAt: r.createdAt! }))
}

export async function checkAuditIntegrity(): Promise<{ ok: boolean; brokenAt?: string; checkedCount: number }> {
  return verifyAuditChain()
}

export async function exportAuditLog(filters: AuditFilters, format: 'csv' | 'jsonl'): Promise<string> {
  const rows = await getAuditPage(filters, 100_000)
  if (format === 'jsonl') return rows.map(r => JSON.stringify(r)).join('\n')
  const header = 'id,action,resource_type,resource_name,actor,created_at'
  const body   = rows.map(r =>
    [r.id, r.action, r.resourceType,
     JSON.stringify(r.resourceName ?? ''), r.actor ?? '', r.createdAt.toISOString()].join(',')
  )
  return [header, ...body].join('\n')
}
