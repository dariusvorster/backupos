import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFileSync } from 'node:fs'

/**
 * Resolve the encryption key.
 *
 * Source order (first match wins):
 *   1. ENCRYPTION_KEY_FILE — path to a file containing the hex key. Useful
 *      with systemd LoadCredential= which exposes secrets at /run/credentials/...
 *   2. ENCRYPTION_KEY — hex key directly in env.
 *
 * Either source must yield at least 64 hex chars (32 bytes). Whitespace
 * around the value (newlines, etc.) is trimmed before validation so a file
 * created with `echo "$KEY" > /path` works.
 */
function getKey(): Buffer {
  const filePath = process.env['ENCRYPTION_KEY_FILE']
  let hex: string

  if (filePath && filePath.length > 0) {
    try {
      hex = readFileSync(filePath, 'utf8').trim()
    } catch (err) {
      throw new Error(
        `Failed to read ENCRYPTION_KEY_FILE at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  } else {
    hex = (process.env['ENCRYPTION_KEY'] ?? '').trim()
  }

  if (hex.length < 64) {
    const source = filePath ? `ENCRYPTION_KEY_FILE (${filePath})` : 'ENCRYPTION_KEY'
    throw new Error(`${source} must contain at least 32 bytes (64 hex chars)`)
  }

  return Buffer.from(hex.slice(0, 64), 'hex')
}

// Returns 'enc:v1:<base64url>' or the original string if already encrypted.
export function encryptField(plaintext: string): string {
  if (plaintext.startsWith('enc:v1:')) return plaintext
  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return 'enc:v1:' + Buffer.concat([iv, tag, enc]).toString('base64url')
}

// Returns decrypted string. Passes through plaintext values for backward compat.
export function decryptField(value: string): string {
  if (!value.startsWith('enc:v1:')) return value
  const buf       = Buffer.from(value.slice(7), 'base64url')
  const iv        = buf.subarray(0, 12)
  const tag       = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher  = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
