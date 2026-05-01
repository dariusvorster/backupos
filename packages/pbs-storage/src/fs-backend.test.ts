import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { FsChunkStore } from './fs-backend'

function digestOf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function streamOf(buf: Buffer): Readable {
  return Readable.from([buf])
}

describe('FsChunkStore', () => {
  let root: string
  let store: FsChunkStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pbs-store-test-'))
    store = new FsChunkStore({ root })
    // Note: NOT calling store.initialize() here. Most tests don't need
    // 65536 pre-allocated shard dirs — put() lazy-creates the one shard
    // it needs. Tests that specifically check initialize() behavior call
    // it explicitly.
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('initialize', () => {
    // initialize() creates 65536 dirs. Even with 256-wide batching that
    // takes 1–2 seconds on most disks. Bump timeout for these tests.
    it('creates 65536 shard directories', { timeout: 30_000 }, async () => {
      await store.initialize()
      const shards = await readdir(join(root, '.chunks'))
      expect(shards.length).toBe(65536)
      expect(shards).toContain('0000')
      expect(shards).toContain('00ff')
      expect(shards).toContain('ffff')
    })

    it('is idempotent', { timeout: 60_000 }, async () => {
      await store.initialize()
      await store.initialize()
      const shards = await readdir(join(root, '.chunks'))
      expect(shards.length).toBe(65536)
    })
  })

  describe('put', () => {
    it('writes a new chunk and reports written:true', async () => {
      const data = Buffer.from('hello chunk store')
      const digest = digestOf(data)
      const result = await store.put(digest, streamOf(data))
      expect(result.written).toBe(true)
      expect(result.size).toBe(data.length)
      expect(result.digestHex).toBe(digest)
    })

    it('deduplicates on second put of same digest', async () => {
      const data = Buffer.from('repeat me')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))
      const second = await store.put(digest, streamOf(data))
      expect(second.written).toBe(false)
      expect(second.size).toBe(data.length)
    })

    it('rejects digest mismatch and leaves no file behind', async () => {
      const data = Buffer.from('actual content')
      const wrongDigest = '0'.repeat(64)
      await expect(
        store.put(wrongDigest, streamOf(data))
      ).rejects.toThrow(/digest mismatch/)
      expect(await store.exists(wrongDigest)).toBe(false)
    })

    it('rejects malformed digest hex', async () => {
      const data = Buffer.from('x')
      await expect(store.put('not-hex', streamOf(data))).rejects.toThrow()
      await expect(store.put('A'.repeat(64), streamOf(data))).rejects.toThrow(/lowercase/)
    })

    it('places chunk in shard directory derived from first 4 hex of digest', async () => {
      const data = Buffer.from('shard placement test')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))
      const shard = digest.slice(0, 4)
      const filesInShard = await readdir(join(root, '.chunks', shard))
      expect(filesInShard).toContain(digest)
    })

    it('drains source stream on dedup so callers can keep streaming', async () => {
      const data = Buffer.from('dedup drain')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))

      let pushed = false
      const observer = new Readable({
        read() {
          if (!pushed) {
            pushed = true
            this.push(data)
            this.push(null)
          }
        }
      })
      const second = await store.put(digest, observer)
      expect(second.written).toBe(false)
      expect(observer.readableEnded).toBe(true)
    })

    it('handles large chunks (1 MiB)', async () => {
      const data = Buffer.alloc(1024 * 1024, 0x42)
      const digest = digestOf(data)
      const result = await store.put(digest, streamOf(data))
      expect(result.written).toBe(true)
      expect(result.size).toBe(1024 * 1024)
    })

    it('leaves no .tmp files behind after successful put', async () => {
      const data = Buffer.from('clean tmp')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))
      const shard = digest.slice(0, 4)
      const files = await readdir(join(root, '.chunks', shard))
      expect(files.filter(f => f.includes('.tmp.'))).toEqual([])
    })

    it('leaves no .tmp files behind after digest-mismatch failure', async () => {
      const data = Buffer.from('failed put')
      const wrongDigest = '1'.repeat(64)
      await expect(store.put(wrongDigest, streamOf(data))).rejects.toThrow()
      const shard = wrongDigest.slice(0, 4)
      const files = await readdir(join(root, '.chunks', shard))
      expect(files).toEqual([])
    })
  })

  describe('get', () => {
    it('returns a readable stream for an existing chunk', async () => {
      const data = Buffer.from('readable test data')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))

      const stream = await store.get(digest)
      expect(stream).not.toBeNull()
      const chunks: Buffer[] = []
      for await (const c of stream!) chunks.push(c as Buffer)
      expect(Buffer.concat(chunks).equals(data)).toBe(true)
    })

    it('returns null for non-existent chunk', async () => {
      const stream = await store.get('a'.repeat(64))
      expect(stream).toBeNull()
    })
  })

  describe('exists', () => {
    it('returns true for existing chunk, false otherwise', async () => {
      const data = Buffer.from('exists check')
      const digest = digestOf(data)
      expect(await store.exists(digest)).toBe(false)
      await store.put(digest, streamOf(data))
      expect(await store.exists(digest)).toBe(true)
    })
  })

  describe('delete', () => {
    it('removes an existing chunk and returns true', async () => {
      const data = Buffer.from('to be deleted')
      const digest = digestOf(data)
      await store.put(digest, streamOf(data))
      expect(await store.delete(digest)).toBe(true)
      expect(await store.exists(digest)).toBe(false)
    })

    it('returns false (idempotent) for non-existent chunk', async () => {
      expect(await store.delete('b'.repeat(64))).toBe(false)
    })
  })

  describe('list', () => {
    it('yields all stored chunk digests', async () => {
      const items = [
        Buffer.from('chunk one'),
        Buffer.from('chunk two'),
        Buffer.from('chunk three'),
      ]
      const digests = items.map(digestOf)
      for (let i = 0; i < items.length; i++) {
        await store.put(digests[i]!, streamOf(items[i]!))
      }
      const found: string[] = []
      for await (const d of store.list()) found.push(d)
      expect(found.sort()).toEqual([...digests].sort())
    })

    it('yields nothing for empty store', async () => {
      const found: string[] = []
      for await (const d of store.list()) found.push(d)
      expect(found).toEqual([])
    })

    it('ignores non-digest files in shard directories', async () => {
      await mkdir(join(root, '.chunks', '0000'), { recursive: true })
      await writeFile(join(root, '.chunks', '0000', 'README'), 'not a chunk')
      const found: string[] = []
      for await (const d of store.list()) found.push(d)
      expect(found).toEqual([])
    })
  })

  describe('stats', () => {
    it('reports chunk count and total bytes', async () => {
      const items = [
        Buffer.from('aaa'),
        Buffer.from('bbbb'),
        Buffer.from('ccccc'),
      ]
      let expectedTotal = 0n
      for (const item of items) {
        await store.put(digestOf(item), streamOf(item))
        expectedTotal += BigInt(item.length)
      }
      const stats = await store.stats()
      expect(stats.chunkCount).toBe(3)
      expect(stats.totalBytes).toBe(expectedTotal)
    })

    it('reports zero for empty store', async () => {
      const stats = await store.stats()
      expect(stats.chunkCount).toBe(0)
      expect(stats.totalBytes).toBe(0n)
    })
  })
})
