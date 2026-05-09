// Per-process in-memory rate limiter for /forgot-password.
// Two independent buckets: per-email (5 req / 15 min) and per-IP (20 req / 60 min).
//
// SCOPE LIMITATION (audit finding #11): this state lives in process memory.
// - Resets on every service restart (including deploys).
// - Not shared across multiple BackupOS instances.
// Acceptable for single-instance deployments. To be replaced with a
// SQLite-backed limiter when BackupOS supports horizontal scaling
// (V2 / multi-instance roadmap).

interface Bucket { count: number; resetAt: number }

const emailStore = new Map<string, Bucket>()
const ipStore    = new Map<string, Bucket>()

const EMAIL_LIMIT  = 5
const EMAIL_WINDOW = 15 * 60 * 1000

const IP_LIMIT  = 20
const IP_WINDOW = 60 * 60 * 1000

function checkBucket(store: Map<string, Bucket>, key: string, limit: number, window: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + window })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

export function checkForgotPasswordRateLimit(email: string, ip: string): { ok: boolean; reason?: string } {
  if (!checkBucket(emailStore, email.toLowerCase(), EMAIL_LIMIT, EMAIL_WINDOW)) {
    return { ok: false, reason: 'email' }
  }
  if (!checkBucket(ipStore, ip, IP_LIMIT, IP_WINDOW)) {
    return { ok: false, reason: 'ip' }
  }
  return { ok: true }
}
