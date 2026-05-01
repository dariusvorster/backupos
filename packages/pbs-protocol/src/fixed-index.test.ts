import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import {
  encodeFixedIndex,
  decodeFixedIndex,
  FIXED_INDEX_MAGIC,
  FIXED_INDEX_HEADER_SIZE,
} from './fixed-index'

function makeUuid(): Uint8Array {
  return new Uint8Array(randomBytes(16))
}

function makeDigests(n: number): Uint8Array[] {
  return Array.from({ length: n }, () => new Uint8Array(randomBytes(32)))
}

describe('fixed index', () => {
  it('round-trips a small index', () => {
    const digests = makeDigests(3)
    const uuid = makeUuid()
    const enc = encodeFixedIndex({
      uuid,
      ctime: 1700000000n,
      size: 12n * 1024n * 1024n,
      chunkSize: 4n * 1024n * 1024n,
      digests,
    })

    expect(enc.length).toBe(FIXED_INDEX_HEADER_SIZE + 3 * 32)

    const dec = decodeFixedIndex(enc)
    expect([...dec.header.uuid]).toEqual([...uuid])
    expect(dec.header.ctime).toBe(1700000000n)
    expect(dec.header.size).toBe(12n * 1024n * 1024n)
    expect(dec.header.chunkSize).toBe(4n * 1024n * 1024n)
    expect(dec.digests).toHaveLength(3)
    for (let i = 0; i < 3; i++) {
      expect([...dec.digests[i]!]).toEqual([...digests[i]!])
    }
  })

  it('header starts with the documented magic', () => {
    const enc = encodeFixedIndex({
      uuid: makeUuid(), ctime: 0n, size: 0n, chunkSize: 4194304n, digests: [],
    })
    for (let i = 0; i < 8; i++) {
      expect(enc[i]).toBe(FIXED_INDEX_MAGIC[i])
    }
  })

  it('rejects mismatched magic', () => {
    const enc = encodeFixedIndex({
      uuid: makeUuid(), ctime: 0n, size: 0n, chunkSize: 4194304n, digests: makeDigests(1),
    })
    enc[0] = 0xff
    expect(() => decodeFixedIndex(enc)).toThrow(/magic/)
  })

  it('rejects body length not divisible by 32', () => {
    const enc = encodeFixedIndex({
      uuid: makeUuid(), ctime: 0n, size: 0n, chunkSize: 4194304n, digests: makeDigests(1),
    })
    const broken = enc.subarray(0, enc.length - 5)
    expect(() => decodeFixedIndex(broken)).toThrow(/multiple of/)
  })

  it('rejects index_csum tampering', () => {
    const enc = encodeFixedIndex({
      uuid: makeUuid(), ctime: 0n, size: 4194304n, chunkSize: 4194304n, digests: makeDigests(1),
    })
    enc[FIXED_INDEX_HEADER_SIZE] = enc[FIXED_INDEX_HEADER_SIZE]! ^ 0xff
    expect(() => decodeFixedIndex(enc)).toThrow(/csum/)
  })
})
