// PBS token authentication middleware.
//
// PBS uses `Authorization: PBSAPIToken=user@realm!tokenname:secret`.
// This module parses that header, looks up the token via the caller-supplied
// AuthLookup callback, and performs a constant-time secret comparison.
//
// The version endpoint does not require auth (liveness probe); all other
// endpoints 401 if authLookup is provided and auth fails.
//
// Clean-room.

import { createHash, timingSafeEqual } from 'crypto'

export interface AuthLookupResult {
  tokenId:     string
  secretHash:  string
  user:        string
  realm:       string
  tokenName:   string
  permissions: string
  expiresAt?:  Date | null
}

/**
 * Called by the server for every authenticated request.
 * Look up a token row by (user, realm, tokenName).
 * Return null if no matching token exists.
 */
export type AuthLookup = (
  user:      string,
  realm:     string,
  tokenName: string,
) => Promise<AuthLookupResult | null>

export interface PbsTokenIdentity {
  tokenId:     string
  user:        string
  realm:       string
  tokenName:   string
  permissions: string
}

export type ValidateResult =
  | { ok: true;  identity: PbsTokenIdentity }
  | { ok: false; reason: string }

function parseAuthHeader(
  authHeader: string,
): { user: string; realm: string; tokenName: string; secret: string } | null {
  const prefix = 'PBSAPIToken='
  if (!authHeader.startsWith(prefix)) return null
  const raw = authHeader.slice(prefix.length)

  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return null
  const secret    = raw.slice(colonIdx + 1)
  const identPart = raw.slice(0, colonIdx)
  if (!secret) return null

  const bangIdx = identPart.indexOf('!')
  if (bangIdx === -1) return null
  const tokenName = identPart.slice(bangIdx + 1)
  const userRealm = identPart.slice(0, bangIdx)
  if (!tokenName) return null

  const atIdx = userRealm.indexOf('@')
  if (atIdx === -1) return null
  const user  = userRealm.slice(0, atIdx)
  const realm = userRealm.slice(atIdx + 1)
  if (!user || !realm) return null

  return { user, realm, tokenName, secret }
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>
}

export async function validatePbsAuth(
  req:    RequestLike,
  lookup: AuthLookup,
): Promise<ValidateResult> {
  const authHeader = (req.headers['authorization'] as string | undefined) ?? ''
  const parsed = parseAuthHeader(authHeader)
  if (!parsed) return { ok: false, reason: 'missing or malformed Authorization header' }

  const record = await lookup(parsed.user, parsed.realm, parsed.tokenName)
  if (!record) return { ok: false, reason: 'token not found' }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return { ok: false, reason: 'token expired' }
  }

  const candidateHash = hashSecret(parsed.secret)
  const a = Buffer.from(candidateHash, 'utf8')
  const b = Buffer.from(record.secretHash, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid secret' }
  }

  return {
    ok: true,
    identity: {
      tokenId:     record.tokenId,
      user:        record.user,
      realm:       record.realm,
      tokenName:   record.tokenName,
      permissions: record.permissions,
    },
  }
}
