export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, instanceSettings }   from '@backupos/db'
import { eq }                        from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'instance:read')
  if (auth instanceof NextResponse) return auth

  const db = getDb()
  let settings = db.select().from(instanceSettings).get()

  // Lazy-generate a stable instance_id on first call
  if (!settings) {
    const id = crypto.randomUUID()
    db.insert(instanceSettings).values({ id: 'singleton', instanceId: id }).run()
    settings = db.select().from(instanceSettings).get()
  } else if (!settings.instanceId) {
    const id = crypto.randomUUID()
    db.update(instanceSettings).set({ instanceId: id }).where(eq(instanceSettings.id, 'singleton')).run()
    settings = db.select().from(instanceSettings).get()
  }

  return NextResponse.json({
    instance_id:       settings?.instanceId       ?? null,
    instance_name:     'BackupOS',
    server_public_url: settings?.serverPublicUrl  ?? null,
    version:           process.env.npm_package_version ?? null,
    retrieved_at:      new Date().toISOString(),
  })
}
