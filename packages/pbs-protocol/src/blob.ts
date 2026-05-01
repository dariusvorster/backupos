// Data Blob (.blob) codec
//
// Source: PBS public documentation
// https://pbs.proxmox.com/docs/file-formats.html (Data Blob Format section)
//
// Four magic-number variants determine the blob layout:
//   uncompressed + unencrypted: 8-byte magic + 4-byte CRC32 + raw data
//   compressed   + unencrypted: 8-byte magic + 4-byte CRC32 + zstd(data)
//   uncompressed + encrypted:   8-byte magic + 4-byte CRC32 + 16B IV + 16B AEAD tag + AES-256-GCM(data)
//   compressed   + encrypted:   same as above but data is zstd then encrypted
//
// CRC32 covers the bytes AFTER the magic and CRC fields (i.e., the body).
// All multi-byte values are little-endian.
// Maximum data size is 16 MiB.

import { createHash } from 'crypto'

// Magic numbers per official PBS file-formats.html documentation.
export const BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED = new Uint8Array([66, 171, 56, 7, 190, 131, 112, 161])
export const BLOB_MAGIC_COMPRESSED_UNENCRYPTED   = new Uint8Array([49, 185, 88, 66, 111, 182, 163, 127])
export const BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED   = new Uint8Array([123, 103, 133, 190, 34, 45, 76, 240])
export const BLOB_MAGIC_COMPRESSED_ENCRYPTED     = new Uint8Array([230, 89, 27, 191, 11, 191, 216, 11])

export const BLOB_MAX_DATA_SIZE = 16 * 1024 * 1024 // 16 MiB

export type BlobVariant =
  | 'uncompressed-unencrypted'
  | 'compressed-unencrypted'
  | 'uncompressed-encrypted'
  | 'compressed-encrypted'

export interface DecodedBlob {
  variant:    BlobVariant
  /** Raw body bytes EXACTLY as they appeared in the blob — caller decompresses/decrypts. */
  body:       Uint8Array
  /** Present for encrypted variants. */
  iv?:        Uint8Array
  /** Present for encrypted variants. */
  tag?:       Uint8Array
}

/** Identify a blob's variant from its magic prefix. Returns null if magic is unknown. */
export function identifyBlobVariant(buf: Uint8Array): BlobVariant | null {
  if (buf.length < 8) return null
  if (bytesEqual(buf.subarray(0, 8), BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED)) return 'uncompressed-unencrypted'
  if (bytesEqual(buf.subarray(0, 8), BLOB_MAGIC_COMPRESSED_UNENCRYPTED))   return 'compressed-unencrypted'
  if (bytesEqual(buf.subarray(0, 8), BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED))   return 'uncompressed-encrypted'
  if (bytesEqual(buf.subarray(0, 8), BLOB_MAGIC_COMPRESSED_ENCRYPTED))     return 'compressed-encrypted'
  return null
}

/**
 * Decode a Data Blob from its on-the-wire bytes.
 * Validates the magic and CRC32 footprint; throws if either is wrong.
 * Does NOT decompress or decrypt — returns raw body bytes for the caller.
 */
export function decodeBlob(buf: Uint8Array): DecodedBlob {
  if (buf.length < 12) {
    throw new Error('blob too short: must contain at least 8-byte magic + 4-byte CRC32')
  }
  const variant = identifyBlobVariant(buf)
  if (!variant) {
    throw new Error('blob magic does not match any known variant')
  }

  const crcStored = readU32LE(buf, 8)
  const isEncrypted = variant === 'uncompressed-encrypted' || variant === 'compressed-encrypted'

  const headerEnd = isEncrypted ? 12 + 16 + 16 : 12

  if (buf.length < headerEnd) {
    throw new Error(`encrypted blob too short: needs at least ${headerEnd} bytes for IV+tag`)
  }

  const body = buf.subarray(headerEnd)
  if (body.length > BLOB_MAX_DATA_SIZE) {
    throw new Error(`blob body exceeds maximum (${BLOB_MAX_DATA_SIZE} bytes)`)
  }

  // CRC32 covers bytes from offset 12 onward (body, plus IV+tag for encrypted blobs)
  const crcSrc = buf.subarray(12)
  const crcComputed = crc32(crcSrc)
  if (crcComputed !== crcStored) {
    throw new Error(`blob CRC32 mismatch: stored=${crcStored.toString(16)}, computed=${crcComputed.toString(16)}`)
  }

  const result: DecodedBlob = { variant, body }
  if (isEncrypted) {
    result.iv  = buf.subarray(12, 28)
    result.tag = buf.subarray(28, 44)
  }
  return result
}

export interface EncodeBlobInput {
  variant: BlobVariant
  /** Already-processed body bytes — caller is responsible for compression/encryption before calling. */
  body:    Uint8Array
  /** Required for encrypted variants. */
  iv?:     Uint8Array
  /** Required for encrypted variants. */
  tag?:    Uint8Array
}

/**
 * Encode a Data Blob.
 * The caller pre-processes the body (zstd compression, AES-256-GCM encryption).
 * This function adds magic + CRC32 framing and (for encrypted variants) the IV+tag header.
 */
export function encodeBlob(input: EncodeBlobInput): Uint8Array {
  if (input.body.length > BLOB_MAX_DATA_SIZE) {
    throw new Error(`blob body exceeds maximum (${BLOB_MAX_DATA_SIZE} bytes)`)
  }
  const isEncrypted = input.variant === 'uncompressed-encrypted' || input.variant === 'compressed-encrypted'
  if (isEncrypted) {
    if (!input.iv || input.iv.length !== 16) throw new Error('encrypted blob requires 16-byte IV')
    if (!input.tag || input.tag.length !== 16) throw new Error('encrypted blob requires 16-byte AE tag')
  }

  const magic = magicForVariant(input.variant)
  const headerSize = 8 + 4 + (isEncrypted ? 32 : 0)
  const out = new Uint8Array(headerSize + input.body.length)

  out.set(magic, 0)
  if (isEncrypted) {
    out.set(input.iv!, 12)
    out.set(input.tag!, 28)
    out.set(input.body, 44)
  } else {
    out.set(input.body, 12)
  }

  const crc = crc32(out.subarray(12))
  writeU32LE(out, 8, crc)
  return out
}

function magicForVariant(v: BlobVariant): Uint8Array {
  switch (v) {
    case 'uncompressed-unencrypted': return BLOB_MAGIC_UNCOMPRESSED_UNENCRYPTED
    case 'compressed-unencrypted':   return BLOB_MAGIC_COMPRESSED_UNENCRYPTED
    case 'uncompressed-encrypted':   return BLOB_MAGIC_UNCOMPRESSED_ENCRYPTED
    case 'compressed-encrypted':     return BLOB_MAGIC_COMPRESSED_ENCRYPTED
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0)
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset]     = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

// CRC-32 (IEEE 802.3 polynomial, reflected). Standard "zlib" CRC.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[i] = c
  }
  return t
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** SHA-256 helper used by index codecs. Re-exported so consumers don't need to import crypto separately. */
export function sha256(buf: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(buf).digest())
}
