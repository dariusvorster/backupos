import { NextResponse } from 'next/server'
import { getDb, backupJobs, agents, eq } from '@backupos/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    const jobCount   = db.select().from(backupJobs).all().length
    const agentCount = db.select().from(agents).where(eq(agents.status, 'connected')).all().length

    return NextResponse.json({
      ok: true,
      version: process.env['npm_package_version'] ?? '0.1.0',
      jobCount,
      agentCount,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 })
  }
}
