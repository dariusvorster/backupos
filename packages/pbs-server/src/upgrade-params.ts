// Parse and validate the query string PVE sends with the backup/reader upgrade request.
// Required fields: store, backup-type, backup-id, backup-time. Optional: ns.
//
// Source: PBS public docs (backup-protocol.html). Clean-room.

export interface UpgradeParams {
  store:      string
  backupType: 'vm' | 'ct' | 'host'
  backupId:   string
  backupTime: Date
  ns?:        string
}

export type UpgradeParamsResult =
  | { ok: true;  params: UpgradeParams }
  | { ok: false; reason: string }

const VALID_TYPES = ['vm', 'ct', 'host'] as const

/**
 * Parse the query string from a PBS upgrade request URL.
 *
 * Input: the path component WITH query string, e.g.
 *   "/api2/json/backup?backup-type=vm&backup-id=100&backup-time=1730000000&store=default&ns=root"
 *
 * Returns parsed + validated params, or a reason string.
 */
export function parseUpgradeParams(pathAndQuery: string): UpgradeParamsResult {
  let url: URL
  try {
    url = new URL(pathAndQuery, 'https://placeholder.invalid')
  } catch {
    return { ok: false, reason: 'malformed URL' }
  }
  const q = url.searchParams

  const store          = q.get('store')
  const backupType     = q.get('backup-type')
  const backupId       = q.get('backup-id')
  const backupTimeRaw  = q.get('backup-time')
  const ns             = q.get('ns') ?? undefined

  if (!store)         return { ok: false, reason: 'missing required parameter "store"' }
  if (!backupType)    return { ok: false, reason: 'missing required parameter "backup-type"' }
  if (!backupId)      return { ok: false, reason: 'missing required parameter "backup-id"' }
  if (!backupTimeRaw) return { ok: false, reason: 'missing required parameter "backup-time"' }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(store)) {
    return { ok: false, reason: 'invalid "store" parameter' }
  }

  if (!(VALID_TYPES as readonly string[]).includes(backupType)) {
    return { ok: false, reason: `invalid "backup-type" — must be one of ${VALID_TYPES.join(', ')}` }
  }

  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(backupId)) {
    return { ok: false, reason: 'invalid "backup-id" — letters, digits, dot, dash, underscore (1-64 chars)' }
  }

  const backupTimeSec = parseInt(backupTimeRaw, 10)
  if (!Number.isFinite(backupTimeSec) || backupTimeSec < 0) {
    return { ok: false, reason: 'invalid "backup-time" — must be a positive integer' }
  }

  // Not before 2010, not after year 3000.
  if (backupTimeSec < 1262304000 || backupTimeSec > 32503680000) {
    return { ok: false, reason: '"backup-time" out of plausible range' }
  }

  if (ns !== undefined && !/^[a-zA-Z0-9_/.-]{0,256}$/.test(ns)) {
    return { ok: false, reason: 'invalid "ns" — only letters, digits, slash, dot, dash, underscore (max 256 chars)' }
  }

  return {
    ok: true,
    params: {
      store,
      backupType: backupType as 'vm' | 'ct' | 'host',
      backupId,
      backupTime: new Date(backupTimeSec * 1000),
      ns,
    },
  }
}
