import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getDb, repositories, smtpConfig, alertChannels, verificationTests, oidcConfig, eq } from '@backupos/db'

export interface RotationStats {
  repositories:      number
  smtpConfig:        number
  alertChannels:     number
  verificationTests: number
  oidcConfig:        number
  total:             number
  durationMs:        number
}

export interface RotationOptions {
  /**
   * If true, perform decryption + re-encryption in memory but do NOT write
   * to the database. Confirms all rows are decryptable with the old key
   * before committing to a real rotation.
   */
  dryRun?: boolean
}

/**
 * Re-encrypt every field-encrypted column from oldHexKey to newHexKey.
 *
 * Both keys must be 64-hex-char strings (32 bytes). Does NOT read or write
 * process.env — operates purely on the SQLite DB and the keys passed in.
 * Caller is responsible for swapping the env file after this returns.
 *
 * Wrapped in a single SQLite transaction: if any row fails to decrypt or
 * re-encrypt, the entire pass rolls back.
 */
export async function rotateEncryptionKey(
  oldHexKey: string,
  newHexKey: string,
  opts: RotationOptions = {},
): Promise<RotationStats> {
  if (oldHexKey.length < 64) throw new Error('oldHexKey must be 64 hex chars')
  if (newHexKey.length < 64) throw new Error('newHexKey must be 64 hex chars')
  if (oldHexKey === newHexKey) throw new Error('oldHexKey and newHexKey must differ')

  const oldKey = Buffer.from(oldHexKey.slice(0, 64), 'hex')
  const newKey = Buffer.from(newHexKey.slice(0, 64), 'hex')

  const startedAt = Date.now()
  const db = getDb()
  const stats: RotationStats = {
    repositories: 0, smtpConfig: 0, alertChannels: 0, verificationTests: 0, oidcConfig: 0,
    total: 0, durationMs: 0,
  }

  const decryptWith = (value: string, key: Buffer): string => {
    if (!value.startsWith('enc:v1:')) return value
    const buf = Buffer.from(value.slice(7), 'base64url')
    const iv  = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const dec = createDecipheriv('aes-256-gcm', key, iv)
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
  }

  const encryptWith = (plaintext: string, key: Buffer): string => {
    if (plaintext.startsWith('enc:v1:')) {
      throw new Error('refusing to double-encrypt a value that already has enc:v1: prefix')
    }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return 'enc:v1:' + Buffer.concat([iv, tag, enc]).toString('base64url')
  }

  const reencrypt = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return value ?? null
    if (!value.startsWith('enc:v1:')) return value // plaintext back-compat — leave alone
    const plain = decryptWith(value, oldKey)
    return encryptWith(plain, newKey)
  }

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

  const reencryptChannelConfig = (type: string, configJson: string): string => {
    const cfg = JSON.parse(configJson) as Record<string, unknown>
    const sensitive = SENSITIVE_FIELDS[type]
    if (!sensitive) return configJson
    for (const field of sensitive) {
      const v = cfg[field]
      if (typeof v === 'string' && v.startsWith('enc:v1:')) {
        cfg[field] = reencrypt(v)
      }
    }
    return JSON.stringify(cfg)
  }

  const reencryptVerificationConfig = (targetType: string, configJson: string | null): string | null => {
    if (!configJson) return configJson
    if (targetType !== 'ssh_target') return configJson
    const cfg = JSON.parse(configJson) as Record<string, unknown>
    const v = cfg['sshKey']
    if (typeof v === 'string' && v.startsWith('enc:v1:')) {
      cfg['sshKey'] = reencrypt(v)
    }
    return JSON.stringify(cfg)
  }

  db.transaction((tx) => {
    // repositories: config + resticPassword
    const repoRows = tx.select().from(repositories).all()
    for (const row of repoRows) {
      const newConfig         = reencrypt(row.config)
      const newResticPassword = reencrypt(row.resticPassword)
      if (newConfig === row.config && newResticPassword === row.resticPassword) continue
      if (!opts.dryRun) {
        tx.update(repositories)
          .set({ config: newConfig!, resticPassword: newResticPassword! })
          .where(eq(repositories.id, row.id))
          .run()
      }
      stats.repositories++
    }

    // smtpConfig: password
    const smtpRows = tx.select().from(smtpConfig).all()
    for (const row of smtpRows) {
      if (!row.password) continue
      const newPassword = reencrypt(row.password)
      if (newPassword === row.password) continue
      if (!opts.dryRun) {
        tx.update(smtpConfig)
          .set({ password: newPassword })
          .where(eq(smtpConfig.id, row.id))
          .run()
      }
      stats.smtpConfig++
    }

    // alertChannels: per-type encrypted fields inside config JSON
    const alertRows = tx.select().from(alertChannels).all()
    for (const row of alertRows) {
      const newConfig = reencryptChannelConfig(row.type, row.config)
      if (newConfig === row.config) continue
      if (!opts.dryRun) {
        tx.update(alertChannels)
          .set({ config: newConfig })
          .where(eq(alertChannels.id, row.id))
          .run()
      }
      stats.alertChannels++
    }

    // verificationTests: sshKey inside targetConfig JSON, only for ssh_target
    const verifyRows = tx.select().from(verificationTests).all()
    for (const row of verifyRows) {
      const newTargetConfig = reencryptVerificationConfig(row.targetType, row.targetConfig)
      if (newTargetConfig === row.targetConfig) continue
      if (!opts.dryRun) {
        tx.update(verificationTests)
          .set({ targetConfig: newTargetConfig })
          .where(eq(verificationTests.id, row.id))
          .run()
      }
      stats.verificationTests++
    }

    // oidcConfig: clientSecretEnc
    const oidcRows = tx.select().from(oidcConfig).all()
    for (const row of oidcRows) {
      if (!row.clientSecretEnc) continue
      const newClientSecretEnc = reencrypt(row.clientSecretEnc)
      if (newClientSecretEnc === row.clientSecretEnc) continue
      if (!opts.dryRun) {
        tx.update(oidcConfig)
          .set({ clientSecretEnc: newClientSecretEnc! })
          .where(eq(oidcConfig.id, row.id))
          .run()
      }
      stats.oidcConfig++
    }
  })

  stats.total      = stats.repositories + stats.smtpConfig + stats.alertChannels + stats.verificationTests + stats.oidcConfig
  stats.durationMs = Date.now() - startedAt
  return stats
}
