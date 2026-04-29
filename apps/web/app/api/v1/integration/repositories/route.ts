export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, repositories }       from '@backupos/db'
import { authenticate }              from '@/lib/integration-auth'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req, 'repositories:read')
  if (auth instanceof NextResponse) return auth

  const db   = getDb()
  const rows = db.select().from(repositories).all()

  return NextResponse.json({
    repositories: rows.map(r => ({
      id:                 r.id,
      name:               r.name,
      backend:            r.backend,
      group:              r.group,
      size_bytes:         r.sizeBytes,
      snapshot_count:     r.snapshotCount,
      last_checked_at:    r.lastCheckedAt?.toISOString()    ?? null,
      last_check_status:  r.lastCheckStatus,
      cost_per_gb_month:  r.costPerGbMonth,
      monthly_budget_cents: r.monthlyBudgetCents,
      created_at:         r.createdAt.toISOString(),
      // restic_password, config, escrowed_key, replicas intentionally omitted
    })),
    total: rows.length,
  })
}
