export interface ChunkStoreStats {
  chunkCount: number
  totalBytes: number
}

export interface ChunkStore {
  /** Write chunk data. Returns its SHA-256 digest. Idempotent — duplicate chunks are a no-op. */
  put(data: Uint8Array): Promise<Uint8Array>
  /** Read chunk by SHA-256 digest. Throws if not found or digest mismatch. */
  get(digest: Uint8Array): Promise<Uint8Array>
  /** Returns true if the chunk with the given digest is present. */
  exists(digest: Uint8Array): Promise<boolean>
  /** Iterate all chunk digests in the store. */
  list(): AsyncIterable<Uint8Array>
  /** Remove a chunk. Returns true if it existed, false if already absent. */
  delete(digest: Uint8Array): Promise<boolean>
  /** Aggregate statistics over the entire store. */
  stats(): Promise<ChunkStoreStats>
}
