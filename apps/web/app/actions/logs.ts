'use server'

import { getDb, operationalLogs } from '@backupos/db'
import { desc, eq, and, like }    from '@backupos/db'
import { requireAdminAction }     from '@/lib/user'

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

function cleanString(value: unknown, maxLength = 128): string | undefined {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || undefined : undefined
}

function cleanLimit(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, max)
    : fallback
}

function cleanFilters(filters: LogFilters | undefined): LogFilters {
  return {
    component:  cleanString(filters?.component),
    level:      cleanString(filters?.level),
    entityType: cleanString(filters?.entityType),
    entityId:   cleanString(filters?.entityId),
    search:     cleanString(filters?.search, 256),
  }
}

export async function getLogsPage(filters: LogFilters = {}, limit = 200): Promise<LogEntry[]> {
  await requireAdminAction()
  filters = cleanFilters(filters)
  limit   = cleanLimit(limit, 200, 1_000)

  const db         = getDb()
  const conditions = []
  if (filters.component)  conditions.push(eq(operationalLogs.component,  filters.component))
  if (filters.level)      conditions.push(eq(operationalLogs.level,      filters.level))
  if (filters.entityType) conditions.push(eq(operationalLogs.entityType, filters.entityType))
  if (filters.entityId)   conditions.push(eq(operationalLogs.entityId,   filters.entityId))

  const query = conditions.length > 0
    ? db.select().from(operationalLogs).where(and(...conditions)).orderBy(desc(operationalLogs.createdAt)).limit(limit * 2)
    : db.select().from(operationalLogs).orderBy(desc(operationalLogs.createdAt)).limit(limit * 2)

  const rows = await query.all()

  return rows
    .filter(r => !filters.search || r.message.toLowerCase().includes(filters.search.toLowerCase()))
    .slice(0, limit)
    .map(r => ({ ...r, createdAt: r.createdAt ?? new Date(0) }))
}

function csvCell(v: string): string {
  const escaped = v.replace(/"/g, '""')
  // Prefix formula starters to prevent spreadsheet injection
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped
  return `"${safe}"`
}

export async function exportLogs(filters: LogFilters, format: 'csv' | 'jsonl'): Promise<string> {
  await requireAdminAction()
  if (format !== 'csv' && format !== 'jsonl') throw new Error('Invalid export format')
  const rows = await getLogsPage(filters, 10_000)
  if (format === 'jsonl') return rows.map(r => JSON.stringify(r)).join('\n')
  const header = '"id","level","component","message","entity_type","entity_id","created_at"'
  const body   = rows.map(r =>
    [csvCell(r.id), csvCell(r.level), csvCell(r.component),
     csvCell(r.message), csvCell(r.entityType ?? ''), csvCell(r.entityId ?? ''),
     csvCell(r.createdAt.toISOString())].join(',')
  )
  return [header, ...body].join('\n')
}
