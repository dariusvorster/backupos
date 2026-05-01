import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import {
  encodeDynamicIndex,
  decodeDynamicIndex,
  DYNAMIC_INDEX_MAGIC,
  DYNAMIC_INDEX_HEADER_SIZE,
} from './dynamic-index'

function makeUuid(): Uint8Array {
  return new Uint8Array(randomBytes(16))
}

describe('dynamic index', () => {
  it('round-trips a small index', () => {
    const entries = [
      { endOffset:  4096n, digest: new Uint8Array(randomBytes(32)) },
      { endOffset:  8192n, digest: new Uint8Array(randomBytes(32)) },
      { endOffset: 16384n, digest: new Uint8Array(randomBytes(32)) },
    ]
    const uuid = makeUuid()
    const enc = encodeDynamicIndex({ uuid, ctime: 1700000000n, entries })

    expect(enc.length).toBe(DYNAMIC_INDEX_HEADER_SIZE + 3 * 40)

    const dec = decodeDynamicIndex(enc)
    expect([...dec.header.uuid]).toEqual([...uuid])
    expect(dec.header.ctime).toBe(1700000000n)
    expect(dec.entries).toHaveLength(3)
    expect(dec.entries[0]!.endOffset).toBe(4096n)
    expect(dec.entries[1]!.endOffset).toBe(8192n)
    expect(dec.entries[2]!.endOffset).toBe(16384n)
    for (let i = 0; i < 3; i++) {
      expect([...dec.entries[i]!.digest]).toEqual([...entries[i]!.digest])
    }
  })

  it('header starts with the documented magic', () => {
    const enc = encodeDynamicIndex({ uuid: makeUuid(), ctime: 0n, entries: [] })
    for (let i = 0; i < 8; i++) {
      expect(enc[i]).toBe(DYNAMIC_INDEX_MAGIC[i])
    }
  })

  it('rejects mismatched magic', () => {
    const enc = encodeDynamicIndex({
      uuid: makeUuid(), ctime: 0n,
      entries: [{ endOffset: 100n, digest: new Uint8Array(randomBytes(32)) }],
    })
    enc[0] = 0xff
    expect(() => decodeDynamicIndex(enc)).toThrow(/magic/)
  })

  it('rejects tampered body', () => {
    const enc = encodeDynamicIndex({
      uuid: makeUuid(), ctime: 0n,
      entries: [{ endOffset: 100n, digest: new Uint8Array(randomBytes(32)) }],
    })
    enc[DYNAMIC_INDEX_HEADER_SIZE + 8] = enc[DYNAMIC_INDEX_HEADER_SIZE + 8]! ^ 0xff
    expect(() => decodeDynamicIndex(enc)).toThrow(/csum/)
  })
})
