import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getDb, integrationTokens } from '@backupos/db'
import { eq }                        from '@backupos/db'
import { hashToken, parseScopes, validateScope, isExpired, isRevoked } from './integration-tokens'
import { appendAuditEntry }          from './audit'

// Per-process in-memory rate limiter for integration tokens.
// Counter resets every 60 s; per-token quota from rateLimitRpm column.
//
// SCOPE LIMITATION (audit finding #11): this state lives in process memory.
// - Resets on every service restart (including deploys).
// - Not shared across multiple BackupOS instances.
// Acceptable for single-instance deployments. To be replaced with a
// SQLite-backed limiter when BackupOS supports horizontal scaling
// (V2 / multi-instance roadmap).
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(tokenId: string, limitRpm: number): boolean {
  const now   = Date.now()
  const entry = rateLimitStore.get(tokenId)
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(tokenId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= limitRpm) return false
  entry.count++
  return true
}

export interface AuthResult {
  tokenId:  string
  tokenName: string
  scopes:   string[]
}

export function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  return auth.slice(7).trim() || null
}

export function authError(status: 401 | 403 | 429, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export async function authenticate(
  req:           NextRequest,
  requiredScope: string,
): Promise<AuthResult | NextResponse> {
  const raw = bearerToken(req)
  if (!raw) return authError(401, 'Missing Bearer token')

  const db    = getDb()
  const token = db.select().from(integrationTokens)
    .where(eq(integrationTokens.tokenHash, hashToken(raw)))
    .get()

  if (!token)                     return authError(401, 'Invalid token')
  if (isExpired(token))           return authError(401, 'Token expired')
  if (isRevoked(token))           return authError(401, 'Token revoked')

  const scopes = parseScopes(token.scopes)
  if (!validateScope(scopes, requiredScope)) return authError(403, `Missing scope: ${requiredScope}`)

  if (!checkRateLimit(token.id, token.rateLimitRpm)) return authError(429, 'Rate limit exceeded')

  // Fire-and-forget: update lastUsedAt and append audit entry
  db.update(integrationTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(integrationTokens.id, token.id))
    .run()

  appendAuditEntry({
    action:       'integration.api_called',
    resourceType: 'integration_token',
    resourceId:   token.id,
    resourceName: token.name,
    detail:       { scope: requiredScope, path: req.nextUrl.pathname },
  })

  return { tokenId: token.id, tokenName: token.name, scopes }
}
