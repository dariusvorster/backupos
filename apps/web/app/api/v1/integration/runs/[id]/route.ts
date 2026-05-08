export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, backupRuns, eq }     from '@backupos/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const expected = process.env.BACKUPOS_INTERNAL_SECRET
  if (!expected) return NextResponse.json({ error: 'internal auth not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db    = getDb()
  const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, params.id)).limit(1)
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    id:            run.id,
    job_id:        run.jobId,
    status:        run.status,
    error_message: run.errorMessage ?? null,
    started_at:    run.startedAt.toISOString(),
    completed_at:  run.completedAt?.toISOString() ?? null,
  })
}
