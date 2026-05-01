// Fixed Index (.fidx) codec — used for VM block-level images
//
// Source: PBS public documentation
// https://pbs.proxmox.com/docs/file-formats.html (Fixed Index Format section)
//
// Header layout (all little-endian, total exactly 4096 bytes):
//   [u8; 8]   magic      = [47, 127, 65, 237, 145, 253, 15, 205]
//   [u8; 16]  uuid
//   i64       ctime      (epoch seconds)
//   [u8; 32]  index_csum = SHA-256 over concat(digest1, digest2, ...)
//   u64       size       (total uncompressed image size)
//   u64       chunk_size (typically 4 MiB = 4194304)
//   [u8; 4016] reserved  (zero-filled)
//
// Body: a flat array of [u8; 32] chunk digests. Number of chunks = ceil(size / chunk_size).

import { sha256 } from './blob'

export const FIXED_INDEX_MAGIC = new Uint8Array([47, 127, 65, 237, 145, 253, 15, 205])
export const FIXED_INDEX_HEADER_SIZE = 4096
export const FIXED_INDEX_DIGEST_SIZE = 32

export interface FixedIndexHeader {
  uuid:       Uint8Array      // 16 bytes
  ctime:      bigint           // i64 epoch seconds
  indexCsum:  Uint8Array      // 32 bytes (SHA-256 over digest concat)
  size:       bigint           // u64 total image size in bytes
  chunkSize:  bigint           // u64 chunk size in bytes
}

export interface FixedIndex {
  header:  FixedIndexHeader
  digests: Uint8Array[]   // each entry is 32 bytes
}

/** Decode a .fidx file from its on-disk bytes. */
export function decodeFixedIndex(buf: Uint8Array): FixedIndex {
  if (buf.length < FIXED_INDEX_HEADER_SIZE) {
    throw new Error('.fidx too short: must contain 4096-byte header')
  }
  if (!bytesEqual(buf.subarray(0, 8), FIXED_INDEX_MAGIC)) {
    throw new Error('.fidx magic mismatch')
  }
  const uuid       = buf.subarray(8, 24)
  const ctime      = readI64LE(buf, 24)
  const indexCsum  = buf.subarray(32, 64)
  const size       = readU64LE(buf, 64)
  const chunkSize  = readU64LE(buf, 72)

  const bodyBytes = buf.subarray(FIXED_INDEX_HEADER_SIZE)
  if (bodyBytes.length % FIXED_INDEX_DIGEST_SIZE !== 0) {
    throw new Error(`.fidx body length ${bodyBytes.length} is not a multiple of ${FIXED_INDEX_DIGEST_SIZE}`)
  }

  const digests: Uint8Array[] = []
  for (let off = 0; off < bodyBytes.length; off += FIXED_INDEX_DIGEST_SIZE) {
    digests.push(bodyBytes.subarray(off, off + FIXED_INDEX_DIGEST_SIZE))
  }

  const computed = sha256(bodyBytes)
  if (!bytesEqual(computed, indexCsum)) {
    throw new Error('.fidx index_csum does not match SHA-256 of digest body')
  }

  return {
    header: { uuid, ctime, indexCsum, size, chunkSize },
    digests,
  }
}

export interface EncodeFixedIndexInput {
  uuid:       Uint8Array       // 16 bytes
  ctime:      bigint
  size:       bigint
  chunkSize:  bigint
  digests:    Uint8Array[]     // each 32 bytes
}

/** Encode a fixed index to its on-disk bytes. Computes index_csum automatically. */
export function encodeFixedIndex(input: EncodeFixedIndexInput): Uint8Array {
  if (input.uuid.length !== 16) throw new Error('uuid must be 16 bytes')
  for (const d of input.digests) {
    if (d.length !== FIXED_INDEX_DIGEST_SIZE) throw new Error('each digest must be 32 bytes')
  }

  const bodyLen = input.digests.length * FIXED_INDEX_DIGEST_SIZE
  const concatBody = new Uint8Array(bodyLen)
  let off = 0
  for (const d of input.digests) {
    concatBody.set(d, off)
    off += FIXED_INDEX_DIGEST_SIZE
  }
  const indexCsum = sha256(concatBody)

  const out = new Uint8Array(FIXED_INDEX_HEADER_SIZE + bodyLen)
  out.set(FIXED_INDEX_MAGIC, 0)
  out.set(input.uuid, 8)
  writeI64LE(out, 24, input.ctime)
  out.set(indexCsum, 32)
  writeU64LE(out, 64, input.size)
  writeU64LE(out, 72, input.chunkSize)
  out.set(concatBody, FIXED_INDEX_HEADER_SIZE)

  return out
}

// ── helpers ───────────────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  let v = 0n
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(buf[offset + i]!)
  return v
}

function writeU64LE(buf: Uint8Array, offset: number, value: bigint): void {
  let v = value
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn)
    v >>= 8n
  }
}

function readI64LE(buf: Uint8Array, offset: number): bigint {
  const u = readU64LE(buf, offset)
  return u >= (1n << 63n) ? u - (1n << 64n) : u
}

function writeI64LE(buf: Uint8Array, offset: number, value: bigint): void {
  const u = value < 0n ? value + (1n << 64n) : value
  writeU64LE(buf, offset, u)
}
