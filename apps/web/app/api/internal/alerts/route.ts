import { NextRequest, NextResponse } from 'next/server'
import { fireBackupSucceeded, fireBackupFailed } from '@/lib/alerts'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const expected = process.env.BACKUPOS_INTERNAL_SECRET
  if (!expected) {
    console.error('[internal-alerts] BACKUPOS_INTERNAL_SECRET not set; rejecting')
    return NextResponse.json({ error: 'internal auth not configured' }, { status: 503 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { event: string; runId?: string; error?: string }
  try {
    body = await req.json() as { event: string; runId?: string; error?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (body.event === 'backup_succeeded' && body.runId) {
    try {
      await fireBackupSucceeded(body.runId)
    } catch (err) {
      console.error('[internal-alerts] fireBackupSucceeded failed:', err)
      return NextResponse.json({ error: 'dispatch failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.event === 'backup_failed' && body.runId) {
    try {
      await fireBackupFailed(body.runId, body.error ?? 'PBS backup failed')
    } catch (err) {
      console.error('[internal-alerts] fireBackupFailed failed:', err)
      return NextResponse.json({ error: 'dispatch failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown event' }, { status: 400 })
}
