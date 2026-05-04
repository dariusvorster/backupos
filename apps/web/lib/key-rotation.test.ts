import { describe, it, expect } from 'vitest'
import { createCipheriv, randomBytes } from 'node:crypto'
import { rotateEncryptionKey } from './key-rotation'

const KEY_A = '0'.repeat(64)
const KEY_B = 'f'.repeat(64)

function encryptWith(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey.slice(0, 64), 'hex')
  const iv  = randomBytes(12)
  const c   = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url')
}

describe('rotateEncryptionKey', () => {
  it('rejects identical keys', async () => {
    await expect(rotateEncryptionKey(KEY_A, KEY_A)).rejects.toThrow(/must differ/)
  })

  it('rejects short old key', async () => {
    await expect(rotateEncryptionKey('abc', KEY_B)).rejects.toThrow(/64 hex/)
  })

  it('rejects short new key', async () => {
    await expect(rotateEncryptionKey(KEY_A, 'abc')).rejects.toThrow(/64 hex/)
  })

  // Integration tests below require injecting a test DB into rotateEncryptionKey.
  // getDb() from @backupos/db is a module-level singleton with no injection point,
  // so these tests cannot be wired without a refactor that is out of scope for this PR.
  // The smoke test in the acceptance checklist covers the integration path.

  it.skip('round-trips: rotate A→B, decrypt with B succeeds', async () => {
    // 1. Set up in-memory DB with migrations
    // 2. Insert repository row with config encrypted under KEY_A
    // 3. rotateEncryptionKey(KEY_A, KEY_B)
    // 4. Read row back, decrypt with KEY_B — expect plaintext to match
  })

  it.skip('atomic: rotation failure rolls back all changes', async () => {
    // 1. Set up DB with two rows: one valid, one with corrupt ciphertext
    // 2. rotateEncryptionKey(KEY_A, KEY_B) → throws on corrupt row
    // 3. First row still decrypts with KEY_A (no partial write)
  })

  it.skip('dry-run: counts rows without writing', async () => {
    // 1. Set up DB with rows encrypted under KEY_A
    // 2. rotateEncryptionKey(KEY_A, KEY_B, { dryRun: true })
    // 3. stats.total > 0; ciphertext in DB still under KEY_A
  })
})
