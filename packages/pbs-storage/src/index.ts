// @backupos/pbs-storage
// Chunk storage backend for PBS-compatible datastores.

export { FsChunkStore } from './fs-backend'
export type { FsChunkStoreOptions } from './fs-backend'

export type {
  ChunkStore,
  ChunkStorePutResult,
  ChunkStoreStats,
  ChunkDigestHex,
} from './types'
