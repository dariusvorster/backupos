// PBS token utilities — parse, format, generate, hash, and verify.
//
// PBS token format (from PBS user-management docs):
//   <user>@<realm>!<tokenname>:<secret>
//
// Authorization header (from PBS forum / pve-storage source):
//   Authorization: PBSAPIToken=<full-token>
//
// Clean-room.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

export interface PbsTokenParts {
  user:      string
  realm:     string
  tokenName: string
  secret:    string
}

/**
 * Parse `user@realm!tokenname:secret` → parts, or null if malformed.
 * Validates that all four segments are non-empty.
 */
export function parsePbsToken(raw: string): PbsTokenParts | null {
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

/** Format `{ user, realm, tokenName, secret }` → `user@realm!tokenname:secret`. */
export function formatPbsToken(parts: PbsTokenParts): string {
  return `${parts.user}@${parts.realm}!${parts.tokenName}:${parts.secret}`
}

/** Generate a cryptographically random 32-byte hex secret. */
export function generatePbsSecret(): string {
  return randomBytes(32).toString('hex')
}

/** Hash a plaintext secret with SHA-256 for storage. */
export function hashPbsSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * Constant-time comparison of a plaintext candidate against a stored SHA-256 hash.
 * Always hashes the candidate first so both buffers are the same length.
 */
export function verifyPbsSecret(candidate: string, storedHash: string): boolean {
  const candidateHash = hashPbsSecret(candidate)
  const a = Buffer.from(candidateHash, 'utf8')
  const b = Buffer.from(storedHash, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Extract the raw PBS token from an `Authorization: PBSAPIToken=<token>` header value.
 * Returns null if the prefix is absent.
 */
export function extractPbsAuthHeader(authHeader: string): string | null {
  const prefix = 'PBSAPIToken='
  if (!authHeader.startsWith(prefix)) return null
  return authHeader.slice(prefix.length)
}
