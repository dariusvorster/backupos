export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, agents }             from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'agents:read')
  if (auth instanceof NextResponse) return auth

  const db   = getDb()
  const rows = db.select().from(agents).all()

  return NextResponse.json({
    agents: rows.map(r => ({
      id:              r.id,
      name:            r.name,
      hostname:        r.hostname,
      platform:        r.platform,
      arch:            r.arch,
      agent_version:   r.agentVersion,
      status:          r.status,
      last_seen_at:    r.lastSeenAt?.toISOString()  ?? null,
      enrolled_at:     r.enrolledAt.toISOString(),
      update_channel:  r.updateChannel,
      // publicKey intentionally omitted
    })),
    total: rows.length,
  })
}
