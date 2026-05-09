export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, backupRuns, eq }     from '@backupos/db'
import { checkInternalAuth }         from '@/lib/internal-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deny = checkInternalAuth(req)
  if (deny) return deny

  const db    = getDb()
  const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1)
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
