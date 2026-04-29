export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, backupMonitors }     from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'monitors:read')
  if (auth instanceof NextResponse) return auth

  const db   = getDb()
  const rows = db.select().from(backupMonitors).all()

  return NextResponse.json({
    monitors: rows.map(r => ({
      id:             r.id,
      name:           r.name,
      type:           r.type,
      group:          r.group,
      status:         r.status,
      last_synced_at: r.lastSyncedAt?.toISOString() ?? null,
      created_at:     r.createdAt.toISOString(),
      // config intentionally omitted (contains encrypted credentials)
    })),
    total: rows.length,
  })
}
