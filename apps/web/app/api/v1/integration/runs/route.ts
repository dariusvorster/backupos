export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, backupRuns }         from '@backupos/db'
import { lt, eq, and, desc }         from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'
import { triggerJobById }            from '@/lib/scheduler'
import { checkInternalAuth }         from '@/lib/internal-auth'

export async function POST(req: NextRequest) {
  const deny = checkInternalAuth(req)
  if (deny) return deny

  let body: { job_id?: string }
  try { body = await req.json() as { job_id?: string } }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }

  if (!body.job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const result = await triggerJobById(body.job_id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({ run_id: result.runId }, { status: 201 })
}

function decodeCursor(cursor: string): { startedAt: Date; id: string } | null {
  try {
    const { startedAt, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    return { startedAt: new Date(startedAt), id }
  } catch { return null }
}

function encodeCursor(startedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ startedAt: startedAt.toISOString(), id })).toString('base64url')
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'runs:read')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = req.nextUrl
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const cursor = searchParams.get('cursor')
  const jobId  = searchParams.get('job_id')

  const db      = getDb()
  const decoded = cursor ? decodeCursor(cursor) : null

  const cursorCond = decoded ? lt(backupRuns.startedAt, decoded.startedAt) : undefined
  const jobCond    = jobId  ? eq(backupRuns.jobId, jobId)                  : undefined
  const where      = cursorCond && jobCond ? and(cursorCond, jobCond) : cursorCond ?? jobCond

  const rows = db.select().from(backupRuns)
    .where(where)
    .orderBy(desc(backupRuns.startedAt))
    .limit(limit + 1)
    .all()

  const hasMore    = rows.length > limit
  const items      = hasMore ? rows.slice(0, limit) : rows
  const last       = items[items.length - 1]
  const nextCursor = hasMore && last
    ? encodeCursor(last.startedAt, last.id)
    : null

  return NextResponse.json({
    runs: items.map(r => ({
      id:            r.id,
      job_id:        r.jobId,
      agent_id:      r.agentId,
      repository_id: r.repositoryId,
      status:        r.status,
      trigger:       r.trigger,
      run_type:      r.runType,
      duration:      r.duration,
      total_size:    r.totalSize,
      error_message: r.errorMessage,
      started_at:    r.startedAt.toISOString(),
      completed_at:  r.completedAt?.toISOString() ?? null,
    })),
    total:       items.length,
    has_more:    hasMore,
    next_cursor: nextCursor,
  })
}
