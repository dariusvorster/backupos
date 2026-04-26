import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'

const TOKEN_PATH = process.env['BACKUPOS_INTERNAL_TOKEN_PATH'] ?? '/var/lib/backupos/internal-token'

export function loadOrCreateInternalToken(): string {
  if (process.env['BACKUPOS_INTERNAL_TOKEN']) return process.env['BACKUPOS_INTERNAL_TOKEN']

  if (existsSync(TOKEN_PATH)) {
    const tok = readFileSync(TOKEN_PATH, 'utf8').trim()
    process.env['BACKUPOS_INTERNAL_TOKEN'] = tok
    return tok
  }

  try {
    mkdirSync(dirname(TOKEN_PATH), { recursive: true })
    const tok = randomBytes(32).toString('base64')
    writeFileSync(TOKEN_PATH, tok, { mode: 0o600 })
    chmodSync(TOKEN_PATH, 0o600)
    process.env['BACKUPOS_INTERNAL_TOKEN'] = tok
    console.log(`[backupos] Generated internal dispatch token at ${TOKEN_PATH}`)
    return tok
  } catch (err) {
    // Non-fatal: fall back to a per-process random token (won't survive restarts but works in dev)
    const tok = randomBytes(32).toString('base64')
    process.env['BACKUPOS_INTERNAL_TOKEN'] = tok
    console.warn(`[backupos] Could not persist internal token (${err}) — using ephemeral token`)
    return tok
  }
}
