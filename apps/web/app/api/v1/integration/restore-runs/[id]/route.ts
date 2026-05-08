export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, restoreRuns, eq }    from '@backupos/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const expected = process.env.BACKUPOS_INTERNAL_SECRET
  if (!expected) return NextResponse.json({ error: 'internal auth not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db    = getDb()
  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, params.id)).limit(1)
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let newVmUUID: string | null = null
  if (run.log) {
    try { newVmUUID = (JSON.parse(run.log) as { newVmUUID?: string }).newVmUUID ?? null }
    catch { /* log may be plain text */ }
  }

  return NextResponse.json({
    id:           run.id,
    status:       run.status,
    new_vm_uuid:  newVmUUID,
    started_at:   run.startedAt.toISOString(),
    completed_at: run.completedAt?.toISOString() ?? null,
  })
}
