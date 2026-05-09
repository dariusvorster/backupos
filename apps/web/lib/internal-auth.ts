import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifies the request's Authorization: Bearer header matches the
 * configured internal secret using a timing-safe comparison.
 *
 * Returns NextResponse with the appropriate error status if invalid,
 * or null if valid (continue processing).
 *
 * Used by internal /api/v1/integration/* routes that are called by the
 * backupos-pbs and backupos-xcp Go services on the same host. The shared
 * secret is loaded from BACKUPOS_INTERNAL_SECRET (set by server-install.sh
 * via lib/internal-token.ts).
 */
export function checkInternalAuth(req: NextRequest): NextResponse | null {
  const expected = process.env['BACKUPOS_INTERNAL_SECRET']
  if (!expected) {
    return NextResponse.json({ error: 'internal auth not configured' }, { status: 503 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`

  // Length check first to avoid timing-leak via comparison-length variance
  if (auth.length !== expectedHeader.length) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Timing-safe equality
  const a = Buffer.from(auth)
  const b = Buffer.from(expectedHeader)
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  return null
}
