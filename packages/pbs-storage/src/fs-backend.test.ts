import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { sha256 } from '@backupos/pbs-protocol'
import { FsChunkStore } from './fs-backend'

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of iter) out.push(x)
  return out
}

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString('hex')
}

let tmp: string
let store: FsChunkStore

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pbs-storage-test-'))
  store = new FsChunkStore(tmp)
  await store.initialize()
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('initialize', () => {
  it('creates all 65536 shard dirs', async () => {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(join(tmp, '.chunks'))
    expect(entries).toHaveLength(65536)
  })

  it('is idempotent — calling twice does not throw', async () => {
    await expect(store.initialize()).resolves.toBeUndefined()
  })
})

describe('put', () => {
  it('returns the SHA-256 digest of the data', async () => {
    const data = new TextEncoder().encode('hello chunk store')
    const digest = await store.put(data)
    expect(toHex(digest)).toBe(toHex(sha256(data)))
  })

  it('stores data retrievable by its digest', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const digest = await store.put(data)
    const back = await store.get(digest)
    expect([...back]).toEqual([...data])
  })

  it('is idempotent — second put returns same digest without error', async () => {
    const data = new TextEncoder().encode('duplicate me')
    const d1 = await store.put(data)
    const d2 = await store.put(data)
    expect(toHex(d1)).toBe(toHex(d2))
  })

  it('does not create a second copy on dedup', async () => {
    const data = new TextEncoder().encode('dedup check')
    const digest = await store.put(data)
    await store.put(data)
    const digests = await collect(store.list())
    expect(digests.filter(d => toHex(d) === toHex(digest))).toHaveLength(1)
  })

  it('places chunk under the correct shard directory', async () => {
    const data = new TextEncoder().encode('shard path check')
    const digest = await store.put(data)
    const shard = toHex(digest.subarray(0, 2))
    const path = join(tmp, '.chunks', shard, toHex(digest))
    const raw = await readFile(path)
    expect([...new Uint8Array(raw)]).toEqual([...data])
  })

  it('round-trips binary data correctly', async () => {
    const data = new Uint8Array(256).map((_, i) => i)
    const digest = await store.put(data)
    const back = await store.get(digest)
    expect([...back]).toEqual([...data])
  })

  it('handles empty Uint8Array', async () => {
    const data = new Uint8Array(0)
    const digest = await store.put(data)
    const back = await store.get(digest)
    expect(back).toHaveLength(0)
  })
})

describe('get', () => {
  it('throws for an unknown digest', async () => {
    const fake = sha256(new TextEncoder().encode('nonexistent'))
    await expect(store.get(fake)).rejects.toThrow(/not found/)
  })

  it('throws when the stored file is corrupt', async () => {
    const data = new TextEncoder().encode('will be corrupted')
    const digest = await store.put(data)
    const shard = toHex(digest.subarray(0, 2))
    const path = join(tmp, '.chunks', shard, toHex(digest))
    await writeFile(path, 'corrupted')
    await expect(store.get(digest)).rejects.toThrow(/mismatch/)
  })
})

describe('exists', () => {
  it('returns true for a stored chunk', async () => {
    const data = new TextEncoder().encode('exists test')
    const digest = await store.put(data)
    expect(await store.exists(digest)).toBe(true)
  })

  it('returns false for an absent chunk', async () => {
    const fake = sha256(new TextEncoder().encode('absent'))
    expect(await store.exists(fake)).toBe(false)
  })

  it('returns false after deletion', async () => {
    const data = new TextEncoder().encode('delete me')
    const digest = await store.put(data)
    await store.delete(digest)
    expect(await store.exists(digest)).toBe(false)
  })
})

describe('delete', () => {
  it('returns true when chunk existed', async () => {
    const data = new TextEncoder().encode('to delete')
    const digest = await store.put(data)
    expect(await store.delete(digest)).toBe(true)
  })

  it('returns false for an absent chunk', async () => {
    const fake = sha256(new TextEncoder().encode('not there'))
    expect(await store.delete(fake)).toBe(false)
  })

  it('makes the chunk unreadable after deletion', async () => {
    const data = new TextEncoder().encode('gone after delete')
    const digest = await store.put(data)
    await store.delete(digest)
    await expect(store.get(digest)).rejects.toThrow(/not found/)
  })
})

describe('list', () => {
  it('yields nothing for an empty store', async () => {
    const digests = await collect(store.list())
    expect(digests).toHaveLength(0)
  })

  it('yields all stored digests', async () => {
    const items = ['alpha', 'beta', 'gamma'].map(s => new TextEncoder().encode(s))
    const expected = await Promise.all(items.map(d => store.put(d)))
    const listed = await collect(store.list())
    const listedHex = listed.map(toHex).sort()
    const expectedHex = expected.map(toHex).sort()
    expect(listedHex).toEqual(expectedHex)
  })

  it('does not yield deleted chunks', async () => {
    const data = new TextEncoder().encode('ephemeral')
    const digest = await store.put(data)
    await store.delete(digest)
    const listed = await collect(store.list())
    expect(listed.map(toHex)).not.toContain(toHex(digest))
  })
})

describe('stats', () => {
  it('returns zeros for an empty store', async () => {
    const s = await store.stats()
    expect(s.chunkCount).toBe(0)
    expect(s.totalBytes).toBe(0)
  })

  it('counts chunks and bytes correctly', async () => {
    const a = new TextEncoder().encode('aaa')
    const b = new TextEncoder().encode('bbbbb')
    await store.put(a)
    await store.put(b)
    const s = await store.stats()
    expect(s.chunkCount).toBe(2)
    expect(s.totalBytes).toBe(a.byteLength + b.byteLength)
  })

  it('reflects deletion in stats', async () => {
    const data = new TextEncoder().encode('count me')
    const digest = await store.put(data)
    await store.delete(digest)
    const s = await store.stats()
    expect(s.chunkCount).toBe(0)
    expect(s.totalBytes).toBe(0)
  })
})
