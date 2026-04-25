import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'] ?? ''
  if (hex.length < 64) throw new Error('ENCRYPTION_KEY must be at least 32 bytes (64 hex chars)')
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
