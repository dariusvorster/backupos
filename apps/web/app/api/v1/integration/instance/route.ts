export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, instanceSettings }   from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'instance:read')
  if (auth instanceof NextResponse) return auth

  const db       = getDb()
  const settings = db.select().from(instanceSettings).get()

  return NextResponse.json({
    instance_name:   'BackupOS',
    server_public_url: settings?.serverPublicUrl ?? null,
    version:         process.env.npm_package_version ?? null,
    retrieved_at:    new Date().toISOString(),
  })
}
