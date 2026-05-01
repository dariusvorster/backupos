import { describe, it, expect } from 'vitest'
import {
  encodeBlob,
  decodeBlob,
  identifyBlobVariant,
  crc32,
  BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED,
  BLOB_MAGIC_COMPRESSED_UNENCRYPTED,
  BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED,
  BLOB_MAGIC_COMPRESSED_ENCRYPTED,
} from './blob'

describe('blob magic identification', () => {
  it('recognizes all 4 variants', () => {
    expect(identifyBlobVariant(BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED)).toBe('uncompressed-unencrypted')
    expect(identifyBlobVariant(BLOB_MAGIC_COMPRESSED_UNENCRYPTED)).toBe('compressed-unencrypted')
    expect(identifyBlobVariant(BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED)).toBe('uncompressed-encrypted')
    expect(identifyBlobVariant(BLOB_MAGIC_COMPRESSED_ENCRYPTED)).toBe('compressed-encrypted')
  })

  it('returns null for unknown magic', () => {
    const fake = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])
    expect(identifyBlobVariant(fake)).toBeNull()
  })

  it('returns null for buffers too short', () => {
    expect(identifyBlobVariant(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('blob round-trip — unencrypted variants', () => {
  const data = new TextEncoder().encode('hello, backupos PBS protocol test data')

  it('round-trips uncompressed unencrypted', () => {
    const enc = encodeBlob({ variant: 'uncompressed-unencrypted', body: data })
    const dec = decodeBlob(enc)
    expect(dec.variant).toBe('uncompressed-unencrypted')
    expect([...dec.body]).toEqual([...data])
    expect(dec.iv).toBeUndefined()
    expect(dec.tag).toBeUndefined()
  })

  it('round-trips compressed unencrypted (treats body as opaque)', () => {
    const fakeCompressedBody = new Uint8Array([28, 181, 47, 253, 1, 2, 3])
    const enc = encodeBlob({ variant: 'compressed-unencrypted', body: fakeCompressedBody })
    const dec = decodeBlob(enc)
    expect(dec.variant).toBe('compressed-unencrypted')
    expect([...dec.body]).toEqual([...fakeCompressedBody])
  })
})

describe('blob round-trip — encrypted variants', () => {
  const ciphertext = new TextEncoder().encode('this is fake ciphertext for test framing')
  const iv  = new Uint8Array(16).fill(0xab)
  const tag = new Uint8Array(16).fill(0xcd)

  it('round-trips uncompressed encrypted', () => {
    const enc = encodeBlob({ variant: 'uncompressed-encrypted', body: ciphertext, iv, tag })
    const dec = decodeBlob(enc)
    expect(dec.variant).toBe('uncompressed-encrypted')
    expect([...dec.body]).toEqual([...ciphertext])
    expect([...dec.iv!]).toEqual([...iv])
    expect([...dec.tag!]).toEqual([...tag])
  })

  it('round-trips compressed encrypted', () => {
    const enc = encodeBlob({ variant: 'compressed-encrypted', body: ciphertext, iv, tag })
    const dec = decodeBlob(enc)
    expect(dec.variant).toBe('compressed-encrypted')
    expect([...dec.iv!]).toEqual([...iv])
    expect([...dec.tag!]).toEqual([...tag])
  })

  it('rejects encrypted blob without IV', () => {
    expect(() => encodeBlob({ variant: 'uncompressed-encrypted', body: ciphertext, tag })).toThrow(/IV/)
  })

  it('rejects encrypted blob without tag', () => {
    expect(() => encodeBlob({ variant: 'uncompressed-encrypted', body: ciphertext, iv })).toThrow(/tag/)
  })
})

describe('blob CRC32', () => {
  it('detects corruption', () => {
    const data = new TextEncoder().encode('intact data')
    const enc = encodeBlob({ variant: 'uncompressed-unencrypted', body: data })
    enc[20] = enc[20]! ^ 0xff
    expect(() => decodeBlob(enc)).toThrow(/CRC32/)
  })

  it('CRC32 over empty buffer is 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('CRC32 of "123456789" is 0xCBF43926 (well-known test vector)', () => {
    const ascii = new TextEncoder().encode('123456789')
    expect(crc32(ascii)).toBe(0xCBF43926)
  })
})

describe('blob errors', () => {
  it('throws for buffer shorter than minimum header', () => {
    expect(() => decodeBlob(new Uint8Array(8))).toThrow(/too short/)
  })

  it('throws for unknown magic', () => {
    const fake = new Uint8Array(16)
    expect(() => decodeBlob(fake)).toThrow(/magic/)
  })
})
