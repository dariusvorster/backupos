import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encryptField, decryptField } from './repo-crypto'

const VALID_HEX = '0'.repeat(64)
let savedKey: string | undefined
let savedKeyFile: string | undefined
let tmpDir: string

beforeEach(() => {
  savedKey     = process.env.ENCRYPTION_KEY
  savedKeyFile = process.env.ENCRYPTION_KEY_FILE
  tmpDir       = mkdtempSync(join(tmpdir(), 'backupos-key-'))
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = savedKey
  if (savedKeyFile === undefined) delete process.env.ENCRYPTION_KEY_FILE
  else process.env.ENCRYPTION_KEY_FILE = savedKeyFile
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('getKey via ENCRYPTION_KEY env', () => {
  it('round-trips an encrypted value', () => {
    delete process.env.ENCRYPTION_KEY_FILE
    process.env.ENCRYPTION_KEY = VALID_HEX
    const enc = encryptField('hello')
    expect(decryptField(enc)).toBe('hello')
  })

  it('throws when env is too short', () => {
    delete process.env.ENCRYPTION_KEY_FILE
    process.env.ENCRYPTION_KEY = 'abcd'
    expect(() => encryptField('x')).toThrow(/ENCRYPTION_KEY/)
  })

  it('throws when env is unset and file is unset', () => {
    delete process.env.ENCRYPTION_KEY_FILE
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptField('x')).toThrow(/ENCRYPTION_KEY/)
  })
})

describe('getKey via ENCRYPTION_KEY_FILE', () => {
  it('reads key from file path', () => {
    const path = join(tmpDir, 'key.hex')
    writeFileSync(path, VALID_HEX, 'utf8')
    process.env.ENCRYPTION_KEY_FILE = path
    delete process.env.ENCRYPTION_KEY
    const enc = encryptField('hello')
    expect(decryptField(enc)).toBe('hello')
  })

  it('trims trailing whitespace/newline (echo $KEY > path style)', () => {
    const path = join(tmpDir, 'key.hex')
    writeFileSync(path, VALID_HEX + '\n', 'utf8')
    process.env.ENCRYPTION_KEY_FILE = path
    delete process.env.ENCRYPTION_KEY
    expect(decryptField(encryptField('hello'))).toBe('hello')
  })

  it('file path takes precedence over env when both are set', () => {
    const path = join(tmpDir, 'key.hex')
    writeFileSync(path, VALID_HEX, 'utf8')
    process.env.ENCRYPTION_KEY_FILE = path
    process.env.ENCRYPTION_KEY = 'f'.repeat(64)
    const enc = encryptField('precedence')
    expect(decryptField(enc)).toBe('precedence')
  })

  it('throws a clear error when file path does not exist', () => {
    process.env.ENCRYPTION_KEY_FILE = join(tmpDir, 'does-not-exist')
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptField('x')).toThrow(/Failed to read ENCRYPTION_KEY_FILE/)
  })

  it('throws when file contents are too short', () => {
    const path = join(tmpDir, 'key.hex')
    writeFileSync(path, 'abcd', 'utf8')
    process.env.ENCRYPTION_KEY_FILE = path
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptField('x')).toThrow(/ENCRYPTION_KEY_FILE/)
  })
})
