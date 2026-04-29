import 'server-only'
import { randomBytes, createHash } from 'crypto'

export type IntegrationScope =
  | 'instance:read'
  | 'services:read'
  | 'jobs:read'
  | 'runs:read'
  | 'agents:read'
  | 'repositories:read'
  | 'monitors:read'
  | 'health:read'

export const ALL_SCOPES: IntegrationScope[] = [
  'instance:read',
  'services:read',
  'jobs:read',
  'runs:read',
  'agents:read',
  'repositories:read',
  'monitors:read',
  'health:read',
]

export const SCOPE_DESCRIPTIONS: Record<IntegrationScope, string> = {
  'instance:read':      'Read instance metadata (version, name, public URL)',
  'services:read':      'Read coverage services list',
  'jobs:read':          'Read backup job list and status',
  'runs:read':          'Read backup run history',
  'agents:read':        'Read agent list and online status',
  'repositories:read':  'Read repository metadata (no secrets or credentials)',
  'monitors:read':      'Read monitor list and sync status',
  'health:read':        'Read consolidated health rollup',
}

export const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

// Token format: bos_int_<32 base64url chars> — cryptographically random, never Math.random
export function generateRawToken(): string {
  return 'bos_int_' + randomBytes(24).toString('base64url').slice(0, 32)
}

// SHA-256 hex digest — high-entropy tokens don't need bcrypt's slow-hash protection
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// First 16 chars of the full token string (e.g. "bos_int_a1b2c3d4") for UI display
export function extractPrefix(token: string): string {
  return token.slice(0, 16)
}

export function validateScope(grantedScopes: string[], requiredScope: string): boolean {
  return grantedScopes.includes(requiredScope)
}

export function parseScopes(scopesJson: string): string[] {
  try { return JSON.parse(scopesJson) as string[] } catch { return [] }
}

export function isExpired(token: { expiresAt: Date | null }): boolean {
  return token.expiresAt !== null && token.expiresAt.getTime() < Date.now()
}

export function isRevoked(token: { revokedAt: Date | null }): boolean {
  if (!token.revokedAt) return false
  return Date.now() - token.revokedAt.getTime() >= GRACE_PERIOD_MS
}

export function isInGracePeriod(token: { revokedAt: Date | null }): boolean {
  if (!token.revokedAt) return false
  const elapsed = Date.now() - token.revokedAt.getTime()
  return elapsed >= 0 && elapsed < GRACE_PERIOD_MS
}
