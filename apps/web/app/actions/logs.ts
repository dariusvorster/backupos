'use server'

import { getDb, operationalLogs } from '@backupos/db'
import { desc }                   from 'drizzle-orm'

export interface LogFilters {
  component?:  string
  level?:      string
  entityType?: string
  entityId?:   string
  search?:     string
}

export interface LogEntry {
  id:         string
  level:      string
  component:  string
  message:    string
  payload:    string | null
  entityType: string | null
  entityId:   string | null
  createdAt:  Date
}

export async function getLogsPage(filters: LogFilters = {}, limit = 200): Promise<LogEntry[]> {
  const db   = getDb()
  const rows = await db.select().from(operationalLogs)
    .orderBy(desc(operationalLogs.createdAt)).limit(limit * 5).all()

  return rows
    .filter(r => {
      if (filters.component  && r.component  !== filters.component)  return false
      if (filters.level      && r.level      !== filters.level)      return false
      if (filters.entityType && r.entityType !== filters.entityType) return false
      if (filters.entityId   && r.entityId   !== filters.entityId)   return false
      if (filters.search     && !r.message.toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
    .slice(0, limit)
    .map(r => ({ ...r, createdAt: r.createdAt! }))
}

export async function exportLogs(filters: LogFilters, format: 'csv' | 'jsonl'): Promise<string> {
  const rows = await getLogsPage(filters, 10_000)
  if (format === 'jsonl') return rows.map(r => JSON.stringify(r)).join('\n')
  const header = 'id,level,component,message,entity_type,entity_id,created_at'
  const body   = rows.map(r =>
    [r.id, r.level, r.component,
     JSON.stringify(r.message), r.entityType ?? '', r.entityId ?? '',
     r.createdAt.toISOString()].join(',')
  )
  return [header, ...body].join('\n')
}
