// ChunkStore — content-addressed chunk storage interface.
//
// Source: on-disk layout per public PBS storage docs
// (https://pbs.proxmox.com/docs/storage.html — Datastore section).
// Clean-room implementation — no PBS or pmoxs3backuproxy source code
// was read or transcribed.
//
// Implementations store opaque byte chunks identified by their SHA-256
// digest. Streaming I/O is required because chunks may be up to 16 MiB
// and a busy server may have many concurrent uploads.

import type { Readable } from 'stream'

/** SHA-256 digest as a 64-character lowercase hex string. */
export type ChunkDigestHex = string

export interface ChunkStorePutResult {
  /** True if newly written; false if already present (deduplicated). */
  written:   boolean
  /** Final size on disk (bytes). */
  size:      number
  /** Echoes the input digest hex for caller convenience. */
  digestHex: ChunkDigestHex
}

export interface ChunkStoreStats {
  chunkCount: number
  totalBytes: bigint
}

/**
 * Content-addressed chunk store with streaming I/O.
 *
 * The chunk body is opaque bytes — the caller is responsible for any
 * encoding (Data Blob framing, compression, encryption) before put.
 *
 * Digests are caller-supplied 64-char lowercase hex strings. The store
 * verifies what arrives on the put stream actually hashes to the
 * supplied digest, rejecting silent corruption. This is a security
 * property: when M4 receives an HTTP/2 chunk upload claiming digest X,
 * we must verify the bytes match X before accepting them.
 */
export interface ChunkStore {
  /**
   * Stream a chunk into the store, validating its digest as it streams.
   *
   * If a chunk with this digest already exists, the source stream is
   * drained but no rewrite happens — `written: false`.
   *
   * Atomic: writes go to a tmp file in the same parent dir, fsync,
   * then atomic rename. A crash mid-write leaves an orphan tmp file
   * that GC can clean up; readers never see a torn write.
   *
   * Throws if the bytes received do not hash to digestHex.
   */
  put(digestHex: ChunkDigestHex, source: Readable): Promise<ChunkStorePutResult>

  /** Open a chunk for reading. Returns null if not present. Caller closes the stream. */
  get(digestHex: ChunkDigestHex): Promise<Readable | null>

  /** Existence check. Cheap — single fs.stat. */
  exists(digestHex: ChunkDigestHex): Promise<boolean>

  /** Yield every digest hex present. Used by GC over many millions of chunks. */
  list(): AsyncIterable<ChunkDigestHex>

  /** Remove a chunk. Returns true if existed, false if absent (idempotent). */
  delete(digestHex: ChunkDigestHex): Promise<boolean>

  /** Aggregate stats. Walks the chunk tree. */
  stats(): Promise<ChunkStoreStats>
}
