#!/usr/bin/env tsx
/**
 * Encryption key rotation CLI.
 *
 * Usage (with the BackupOS service stopped):
 *
 *   sudo systemctl stop backupos
 *   cd /opt/backupos
 *   sudo -u backupos tsx apps/web/scripts/rotate-key.ts
 *   sudo systemctl start backupos
 *
 * Steps:
 *   1. Reads ENCRYPTION_KEY (or ENCRYPTION_KEY_FILE) from /etc/backupos/server.env
 *   2. Generates a new key
 *   3. Re-encrypts every stored secret in a single SQLite transaction
 *   4. Writes the new key to the env file (or key file)
 *   5. Backs up the old env file as server.env.pre-rotation-<timestamp>
 */

import { writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { rotateEncryptionKey } from '../lib/key-rotation'

const ENV_FILE_PATH = process.env['BACKUPOS_ENV_FILE'] ?? '/etc/backupos/server.env'

function loadEnv(): Record<string, string> {
  const raw = readFileSync(ENV_FILE_PATH, 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) env[m[1]!] = m[2]!
  }
  return env
}

async function main() {
  const env = loadEnv()

  let oldKey: string
  if (env['ENCRYPTION_KEY_FILE']) {
    oldKey = readFileSync(env['ENCRYPTION_KEY_FILE'], 'utf8').trim()
  } else if (env['ENCRYPTION_KEY']) {
    oldKey = env['ENCRYPTION_KEY']
  } else {
    console.error(`ERROR: neither ENCRYPTION_KEY nor ENCRYPTION_KEY_FILE found in ${ENV_FILE_PATH}`)
    process.exit(1)
  }

  if (oldKey.length < 64) {
    console.error(`ERROR: key in env is too short (${oldKey.length} chars; need 64 hex chars)`)
    process.exit(1)
  }

  process.env['ENCRYPTION_KEY'] = oldKey
  delete process.env['ENCRYPTION_KEY_FILE']

  const newKey = randomBytes(32).toString('hex')

  console.log(`[rotate-key] starting rotation`)
  console.log(`[rotate-key] env file: ${ENV_FILE_PATH}`)

  let stats
  try {
    stats = await rotateEncryptionKey(oldKey, newKey)
  } catch (err) {
    console.error(`[rotate-key] FAILED — DB unchanged (transaction rolled back)`)
    console.error(err)
    process.exit(2)
  }

  console.log(`[rotate-key] DB rewrite: ${stats.total} fields in ${stats.durationMs}ms`)
  console.log(`             repos=${stats.repositories} smtp=${stats.smtpConfig} alerts=${stats.alertChannels} verify=${stats.verificationTests}`)

  const backupPath = `${ENV_FILE_PATH}.pre-rotation-${Date.now()}`
  try {
    copyFileSync(ENV_FILE_PATH, backupPath)
    console.log(`[rotate-key] env backed up to ${backupPath}`)
  } catch (backupErr) {
    console.error(`[rotate-key] WARNING: could not back up env file:`, backupErr)
  }

  if (env['ENCRYPTION_KEY_FILE']) {
    const keyFilePath = env['ENCRYPTION_KEY_FILE']
    try {
      writeFileSync(keyFilePath, newKey, { mode: 0o600 })
      console.log(`[rotate-key] new key written to ${keyFilePath}`)
    } catch (writeErr) {
      console.error(`[rotate-key] CRITICAL: DB rotated but key file write failed`)
      console.error(`[rotate-key] write the new key manually: echo '<key>' | sudo tee ${keyFilePath}`)
      console.error(`[rotate-key] new key: ${newKey}`)
      process.exit(3)
    }
  } else {
    const raw = readFileSync(ENV_FILE_PATH, 'utf8')
    const updated = raw.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${newKey}`)
    if (updated === raw) {
      console.error(`[rotate-key] CRITICAL: ENCRYPTION_KEY= line not found in env file`)
      console.error(`[rotate-key] add manually: ENCRYPTION_KEY=${newKey}`)
      process.exit(4)
    }
    try {
      writeFileSync(ENV_FILE_PATH, updated, { mode: 0o600 })
      console.log(`[rotate-key] new key written to ${ENV_FILE_PATH}`)
    } catch (writeErr) {
      console.error(`[rotate-key] CRITICAL: DB rotated but env file write failed`)
      console.error(`[rotate-key] add manually: ENCRYPTION_KEY=${newKey}`)
      process.exit(5)
    }
  }

  console.log(`[rotate-key] DONE. Restart: sudo systemctl start backupos backupos-pbs`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
