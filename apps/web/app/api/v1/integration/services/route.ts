export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, infraOsServices }    from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'services:read')
  if (auth instanceof NextResponse) return auth

  const db   = getDb()
  const rows = db.select().from(infraOsServices).all()

  return NextResponse.json({
    services: rows.map(r => ({
      id:           r.id,
      name:         r.name,
      service_type: r.serviceType,
      host:         r.host,
      description:  r.description,
      created_at:   r.createdAt?.toISOString() ?? null,
    })),
    total: rows.length,
  })
}
