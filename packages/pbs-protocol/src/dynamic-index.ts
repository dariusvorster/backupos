// Dynamic Index (.didx) codec — used for file archives (.pxar) with rolling-hash chunks
//
// Source: PBS public documentation
// https://pbs.proxmox.com/docs/file-formats.html (Dynamic Index Format section)
//
// Header layout (all little-endian, total exactly 4096 bytes):
//   [u8; 8]   magic      = [28, 145, 78, 165, 25, 186, 179, 205]
//   [u8; 16]  uuid
//   i64       ctime
//   [u8; 32]  index_csum = SHA-256 over concat(offset1, digest1, offset2, digest2, ...)
//   [u8; 4032] reserved
//
// Body: an array of (offset: u64, digest: [u8; 32]) entries — 40 bytes each.
// Each `offset` is the END offset of that chunk in the reconstructed stream (cumulative).

import { sha256 } from './blob'

export const DYNAMIC_INDEX_MAGIC = new Uint8Array([28, 145, 78, 165, 25, 186, 179, 205])
export const DYNAMIC_INDEX_HEADER_SIZE = 4096
export const DYNAMIC_INDEX_ENTRY_SIZE = 40 // 8 (offset) + 32 (digest)
export const DYNAMIC_INDEX_DIGEST_SIZE = 32

export interface DynamicIndexHeader {
  uuid:       Uint8Array     // 16 bytes
  ctime:      bigint          // i64
  indexCsum:  Uint8Array     // 32 bytes
}

export interface DynamicIndexEntry {
  /** End offset of this chunk in the reconstructed stream (cumulative). */
  endOffset: bigint
  /** SHA-256 digest of the chunk content. */
  digest:    Uint8Array      // 32 bytes
}

export interface DynamicIndex {
  header:  DynamicIndexHeader
  entries: DynamicIndexEntry[]
}

export function decodeDynamicIndex(buf: Uint8Array): DynamicIndex {
  if (buf.length < DYNAMIC_INDEX_HEADER_SIZE) {
    throw new Error('.didx too short: must contain 4096-byte header')
  }
  if (!bytesEqual(buf.subarray(0, 8), DYNAMIC_INDEX_MAGIC)) {
    throw new Error('.didx magic mismatch')
  }
  const uuid      = buf.subarray(8, 24)
  const ctime     = readI64LE(buf, 24)
  const indexCsum = buf.subarray(32, 64)

  const bodyBytes = buf.subarray(DYNAMIC_INDEX_HEADER_SIZE)
  if (bodyBytes.length % DYNAMIC_INDEX_ENTRY_SIZE !== 0) {
    throw new Error(`.didx body length ${bodyBytes.length} is not a multiple of ${DYNAMIC_INDEX_ENTRY_SIZE}`)
  }

  const entries: DynamicIndexEntry[] = []
  for (let off = 0; off < bodyBytes.length; off += DYNAMIC_INDEX_ENTRY_SIZE) {
    const endOffset = readU64LE(bodyBytes, off)
    const digest    = bodyBytes.subarray(off + 8, off + 8 + DYNAMIC_INDEX_DIGEST_SIZE)
    entries.push({ endOffset, digest })
  }

  const computed = sha256(bodyBytes)
  if (!bytesEqual(computed, indexCsum)) {
    throw new Error('.didx index_csum does not match SHA-256 of entry body')
  }

  return {
    header: { uuid, ctime, indexCsum },
    entries,
  }
}

export interface EncodeDynamicIndexInput {
  uuid:    Uint8Array         // 16 bytes
  ctime:   bigint
  entries: DynamicIndexEntry[]
}

export function encodeDynamicIndex(input: EncodeDynamicIndexInput): Uint8Array {
  if (input.uuid.length !== 16) throw new Error('uuid must be 16 bytes')
  for (const e of input.entries) {
    if (e.digest.length !== DYNAMIC_INDEX_DIGEST_SIZE) throw new Error('each digest must be 32 bytes')
  }

  const bodyLen = input.entries.length * DYNAMIC_INDEX_ENTRY_SIZE
  const body = new Uint8Array(bodyLen)
  let off = 0
  for (const e of input.entries) {
    writeU64LE(body, off, e.endOffset)
    body.set(e.digest, off + 8)
    off += DYNAMIC_INDEX_ENTRY_SIZE
  }
  const indexCsum = sha256(body)

  const out = new Uint8Array(DYNAMIC_INDEX_HEADER_SIZE + bodyLen)
  out.set(DYNAMIC_INDEX_MAGIC, 0)
  out.set(input.uuid, 8)
  writeI64LE(out, 24, input.ctime)
  out.set(indexCsum, 32)
  out.set(body, DYNAMIC_INDEX_HEADER_SIZE)

  return out
}

// ── helpers ─────────────────────────────────────────────────────────

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
