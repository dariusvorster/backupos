// @backupos/pbs-protocol
// Wire types and format constants for the Proxmox Backup Server protocol.
// Pure types and constants — no I/O.
//
// Implementation milestones tracked in docs/design/pbs-backend.md.

export const PBS_PROTOCOL_VERSION = '1' as const

export {
  BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED,
  BLOB_MAGIC_COMPRESSED_UNENCRYPTED,
  BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED,
  BLOB_MAGIC_COMPRESSED_ENCRYPTED,
  BLOB_MAX_DATA_SIZE,
  identifyBlobVariant,
  decodeBlob,
  encodeBlob,
  crc32,
  sha256,
} from './blob'
export type { BlobVariant, DecodedBlob, EncodeBlobInput } from './blob'

export {
  FIXED_INDEX_MAGIC,
  FIXED_INDEX_HEADER_SIZE,
  FIXED_INDEX_DIGEST_SIZE,
  decodeFixedIndex,
  encodeFixedIndex,
} from './fixed-index'
export type { FixedIndexHeader, FixedIndex, EncodeFixedIndexInput } from './fixed-index'

export {
  DYNAMIC_INDEX_MAGIC,
  DYNAMIC_INDEX_HEADER_SIZE,
  DYNAMIC_INDEX_ENTRY_SIZE,
  DYNAMIC_INDEX_DIGEST_SIZE,
  decodeDynamicIndex,
  encodeDynamicIndex,
} from './dynamic-index'
export type { DynamicIndexHeader, DynamicIndexEntry, DynamicIndex, EncodeDynamicIndexInput } from './dynamic-index'
