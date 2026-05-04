'use server'

import { writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { requireAdmin } from '@/lib/user'
import { rotateEncryptionKey, type RotationStats } from '@/lib/key-rotation'

const ENV_FILE_PATH = process.env['BACKUPOS_ENV_FILE'] ?? '/etc/backupos/server.env'

export interface RotateResult {
  ok:     boolean
  error?: string
  stats?: RotationStats
}

/**
 * Rotate the encryption key.
 *
 * 1. Generate a new 32-byte hex key.
 * 2. Re-encrypt all DB fields in a single transaction.
 * 3. Back up the env file, write the new key in.
 * 4. Schedule a graceful exit so systemd restarts with the new key.
 *
 * On any error before step 3 the DB is unchanged (rolled back) and the
 * env file is untouched.
 */
export async function rotateEncryptionKeyAction(): Promise<RotateResult> {
  await requireAdmin()

  const oldKey = process.env['ENCRYPTION_KEY']
  if (!oldKey || oldKey.length < 64) {
    return { ok: false, error: 'ENCRYPTION_KEY not set or too short — cannot rotate from a key the server cannot read' }
  }

  if (process.env['ENCRYPTION_KEY_FILE']) {
    return {
      ok: false,
      error: 'ENCRYPTION_KEY_FILE is set; rotate via CLI: tsx apps/web/scripts/rotate-key.ts',
    }
  }

  const newKey = randomBytes(32).toString('hex')

  let stats: RotationStats
  try {
    stats = await rotateEncryptionKey(oldKey, newKey)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  let envContents: string
  try {
    envContents = readFileSync(ENV_FILE_PATH, 'utf8')
  } catch (err) {
    return {
      ok: false,
      error: `DB rotated successfully but env file at ${ENV_FILE_PATH} could not be read: ${err instanceof Error ? err.message : String(err)}. Manual intervention required: write ENCRYPTION_KEY=${newKey} to the env file before restarting the service.`,
    }
  }

  try {
    const backupPath = `${ENV_FILE_PATH}.pre-rotation-${Date.now()}`
    copyFileSync(ENV_FILE_PATH, backupPath)
  } catch (err) {
    console.error('[key-rotation] failed to back up env file (continuing):', err)
  }

  const newContents = envContents.replace(
    /^ENCRYPTION_KEY=.*$/m,
    `ENCRYPTION_KEY=${newKey}`,
  )
  if (newContents === envContents) {
    return {
      ok: false,
      error: `DB rotated but env file does not contain an ENCRYPTION_KEY= line. Add ENCRYPTION_KEY=${newKey} manually before restarting.`,
    }
  }

  try {
    writeFileSync(ENV_FILE_PATH, newContents, { mode: 0o600 })
  } catch (err) {
    return {
      ok: false,
      error: `DB rotated but writing the env file failed: ${err instanceof Error ? err.message : String(err)}. Write ENCRYPTION_KEY=${newKey} to ${ENV_FILE_PATH} manually before restarting.`,
    }
  }

  setTimeout(() => {
    console.log('[key-rotation] rotation complete; exiting for systemd restart')
    process.exit(0)
  }, 1000)

  return { ok: true, stats }
}
