export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }       from 'next/server'
import { getDb, backupJobs }               from '@backupos/db'
import { lt, gt, eq, and, desc }           from '@backupos/db'
import { authenticate }                    from '@/lib/integration-auth'

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const { createdAt, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    return { createdAt: new Date(createdAt), id }
  } catch { return null }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url')
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'jobs:read')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = req.nextUrl
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const cursor = searchParams.get('cursor')

  const db      = getDb()
  const decoded = cursor ? decodeCursor(cursor) : null

  const where = decoded
    ? lt(backupJobs.createdAt, decoded.createdAt)
    : undefined

  const rows = db.select().from(backupJobs)
    .where(where)
    .orderBy(desc(backupJobs.createdAt))
    .limit(limit + 1)
    .all()

  const hasMore  = rows.length > limit
  const items    = hasMore ? rows.slice(0, limit) : rows
  const last     = items[items.length - 1]
  const nextCursor = hasMore && last
    ? encodeCursor(last.createdAt!, last.id)
    : null

  return NextResponse.json({
    jobs: items.map(r => ({
      id:              r.id,
      name:            r.name,
      schedule:        r.schedule,
      enabled:         r.enabled,
      source_type:     r.sourceType,
      repository_id:   r.repositoryId,
      agent_id:        r.agentId,
      last_run_at:     r.lastRunAt?.toISOString()   ?? null,
      last_run_status: r.lastRunStatus,
      next_run_at:     r.nextRunAt?.toISOString()   ?? null,
      created_at:      r.createdAt?.toISOString()   ?? null,
    })),
    total:       items.length,
    has_more:    hasMore,
    next_cursor: nextCursor,
  })
}
