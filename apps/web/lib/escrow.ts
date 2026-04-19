import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'

interface EscrowBlob {
  salt:       string
  iv:         string
  ciphertext: string
  authTag:    string
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 }) as Buffer
}

export function encryptPassword(password: string, passphrase: string): string {
  const salt = randomBytes(16)
  const iv   = randomBytes(12)
  const key  = deriveKey(passphrase, salt)

  const cipher     = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()

  const blob: EscrowBlob = {
    salt:       salt.toString('hex'),
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    authTag.toString('hex'),
  }
  return JSON.stringify(blob)
}

export function decryptPassword(escrowJson: string, passphrase: string): string {
  const blob: EscrowBlob = JSON.parse(escrowJson)
  const salt = Buffer.from(blob.salt, 'hex')
  const iv   = Buffer.from(blob.iv, 'hex')
  const key  = deriveKey(passphrase, salt)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
