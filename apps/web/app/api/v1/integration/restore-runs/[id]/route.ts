export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, restoreRuns, eq }    from '@backupos/db'
import { checkInternalAuth }         from '@/lib/internal-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deny = checkInternalAuth(req)
  if (deny) return deny

  const db    = getDb()
  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, id)).limit(1)
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
