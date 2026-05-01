// Filesystem-backed, content-addressed chunk store.
//
// On-disk layout (mirrors PBS datastore convention):
//   <root>/.chunks/<4-hex-shard>/<64-hex-digest>
//
// Shard = first two bytes of the SHA-256 digest expressed as 4 lowercase hex chars.
// All 65 536 shard dirs (0000–ffff) are pre-allocated by initialize() so that
// directory creation is never on the hot path.
//
// Writes are atomic: data lands in a tmp file (same parent dir, so rename is
// same-device), fdatasync'd, then renamed into place.

import { mkdir, stat, open, rename, unlink, readdir } from 'fs/promises'
import { join } from 'path'
import { sha256 } from '@backupos/pbs-protocol'
import type { ChunkStore, ChunkStoreStats } from './types'

const SHARD_COUNT = 0x10000 // 65 536

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString('hex')
}

function shardName(digest: Uint8Array): string {
  return toHex(digest.subarray(0, 2))
}

function chunkPath(root: string, digest: Uint8Array): string {
  return join(root, '.chunks', shardName(digest), toHex(digest))
}

export class FsChunkStore implements ChunkStore {
  constructor(readonly root: string) {}

  /** Create all shard directories. Safe to call multiple times (recursive: true). */
  async initialize(): Promise<void> {
    for (let i = 0; i < SHARD_COUNT; i++) {
      const shard = i.toString(16).padStart(4, '0')
      await mkdir(join(this.root, '.chunks', shard), { recursive: true })
    }
  }

  async put(data: Uint8Array): Promise<Uint8Array> {
    const digest = sha256(data)
    const target = chunkPath(this.root, digest)

    // Dedup short-circuit — if file already exists, skip the write.
    try {
      await stat(target)
      return digest
    } catch {
      // not found — proceed
    }

    const shard = join(this.root, '.chunks', shardName(digest))
    const tmp = join(shard, `.tmp.${process.pid}.${Date.now()}`)

    const fh = await open(tmp, 'w')
    try {
      await fh.writeFile(data)
      await fh.datasync()
    } finally {
      await fh.close()
    }

    await rename(tmp, target)
    return digest
  }

  async get(digest: Uint8Array): Promise<Uint8Array> {
    const target = chunkPath(this.root, digest)
    let buf: Buffer
    try {
      const fh = await open(target, 'r')
      try {
        buf = await fh.readFile()
      } finally {
        await fh.close()
      }
    } catch {
      throw new Error(`chunk not found: ${toHex(digest)}`)
    }

    const data = new Uint8Array(buf)
    const actual = sha256(data)
    if (toHex(actual) !== toHex(digest)) {
      throw new Error(`chunk digest mismatch: expected ${toHex(digest)}, got ${toHex(actual)}`)
    }

    return data
  }

  async exists(digest: Uint8Array): Promise<boolean> {
    try {
      await stat(chunkPath(this.root, digest))
      return true
    } catch {
      return false
    }
  }

  async *list(): AsyncIterable<Uint8Array> {
    for (let i = 0; i < SHARD_COUNT; i++) {
      const shard = i.toString(16).padStart(4, '0')
      const dir = join(this.root, '.chunks', shard)
      let entries: string[]
      try {
        entries = await readdir(dir)
      } catch {
        continue
      }
      for (const name of entries) {
        if (name.startsWith('.')) continue
        const bytes = Buffer.from(name, 'hex')
        if (bytes.length === 32) yield new Uint8Array(bytes)
      }
    }
  }

  async delete(digest: Uint8Array): Promise<boolean> {
    try {
      await unlink(chunkPath(this.root, digest))
      return true
    } catch {
      return false
    }
  }

  async stats(): Promise<ChunkStoreStats> {
    let chunkCount = 0
    let totalBytes = 0
    for await (const digest of this.list()) {
      chunkCount++
      try {
        const s = await stat(chunkPath(this.root, digest))
        totalBytes += s.size
      } catch {
        // chunk was deleted between list and stat — skip
      }
    }
    return { chunkCount, totalBytes }
  }
}
