import * as OTPAuth from 'otpauth'
import { randomBytes } from 'crypto'

export function generateTotpSecret(): string {
  return new OTPAuth.Secret().base32
}

export function createTotpUri(secret: string, email: string): string {
  return new OTPAuth.TOTP({
    issuer:    'BackupOS',
    label:     email,
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret:    OTPAuth.Secret.fromBase32(secret),
  }).toString()
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer:    'BackupOS',
    label:     '',
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret:    OTPAuth.Secret.fromBase32(secret),
  })
  return totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null
}

export function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = randomBytes(4).toString('hex').toUpperCase()
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`
  })
}
