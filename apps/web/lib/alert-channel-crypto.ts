import { encryptField, decryptField } from './repo-crypto'

const SENSITIVE_FIELDS: Record<string, readonly string[]> = {
  discord:   ['url'],
  slack:     ['url'],
  webhook:   ['url'],
  zulip:     ['apiKey'],
  telegram:  ['botToken'],
  pagerduty: ['integrationKey'],
  ntfy:      ['auth'],
  gotify:    ['appToken'],
  pushover:  ['apiToken', 'userKey'],
}

/**
 * Encrypt sensitive fields in an alert channel config object before serializing
 * to the alert_channels.config JSON column.
 *
 * Idempotent: encryptField passes through values that already start with `enc:v1:`.
 */
export function encryptChannelConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const sensitive = SENSITIVE_FIELDS[type]
  if (!sensitive) return config
  const out: Record<string, unknown> = { ...config }
  for (const field of sensitive) {
    const value = out[field]
    if (typeof value === 'string' && value.length > 0) {
      out[field] = encryptField(value)
    }
  }
  return out
}

/**
 * Decrypt sensitive fields in an alert channel config object after parsing
 * the alert_channels.config JSON column.
 *
 * decryptField returns the input unchanged if it is already plaintext, so
 * mixed plaintext/ciphertext rows (during the migration window) work.
 *
 * Throws if any sensitive field has a corrupt ciphertext. The caller in
 * dispatchToChannel catches this and skips that channel rather than failing
 * the whole sendAlert.
 */
export function decryptChannelConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const sensitive = SENSITIVE_FIELDS[type]
  if (!sensitive) return config
  const out: Record<string, unknown> = { ...config }
  for (const field of sensitive) {
    const value = out[field]
    if (typeof value === 'string' && value.length > 0) {
      out[field] = decryptField(value)
    }
  }
  return out
}

/**
 * One-time migration. Reads every row in alert_channels, encrypts any
 * sensitive fields that aren't already encrypted, and writes back.
 *
 * Idempotent: re-running is a no-op (encryptField passes through enc:v1:
 * values). Safe to call on every server startup.
 *
 * Logs (not throws) per-row failures so a single corrupt row doesn't block
 * boot.
 */
export async function migrateAlertChannelEncryption(): Promise<void> {
  const { getDb, alertChannels, eq } = await import('@backupos/db')
  const db = getDb()

  const rows = await db.select().from(alertChannels).all()
  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      const cfg = JSON.parse(row.config) as Record<string, unknown>
      const sensitive = SENSITIVE_FIELDS[row.type]
      if (!sensitive) {
        skipped++
        continue
      }
      const needsMigration = sensitive.some(field => {
        const v = cfg[field]
        return typeof v === 'string' && v.length > 0 && !v.startsWith('enc:v1:')
      })
      if (!needsMigration) {
        skipped++
        continue
      }
      const encrypted = encryptChannelConfig(row.type, cfg)
      await db.update(alertChannels)
        .set({ config: JSON.stringify(encrypted) })
        .where(eq(alertChannels.id, row.id))
      migrated++
    } catch (err) {
      console.error(
        `[alert-channel-crypto] migration failed for channel ${row.id} (${row.type}):`,
        err,
      )
      failed++
    }
  }

  if (migrated > 0 || failed > 0) {
    console.log(
      `[alert-channel-crypto] migrated=${migrated} skipped=${skipped} failed=${failed}`,
    )
  }
}
