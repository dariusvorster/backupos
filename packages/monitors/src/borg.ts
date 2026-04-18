import { spawn } from 'child_process'
import type {
  BackupMonitorAdapter,
  BorgConfig,
  BorgInfoJson,
  BorgListJson,
  MonitorConfig,
  MonitorSyncResult,
} from './types'

export class BorgMonitor implements BackupMonitorAdapter {
  readonly type = 'borg'
  readonly displayName = 'BorgBackup'

  async test(config: MonitorConfig): Promise<{ ok: boolean; message?: string }> {
    const cfg = config as BorgConfig
    try {
      await this.runBorg(cfg, ['info', '--json', cfg.repoPath])
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(config: MonitorConfig): Promise<MonitorSyncResult> {
    const cfg = config as BorgConfig

    // List all archives
    const listOut  = await this.runBorg(cfg, ['list', '--json', cfg.repoPath])
    const listJson = JSON.parse(listOut) as BorgListJson

    const archives   = listJson.archives ?? []
    const lastArchive = archives.at(-1)

    // Get repo stats via info on the latest archive (if any)
    let sizeBytes: number | undefined
    if (lastArchive) {
      try {
        const infoOut  = await this.runBorg(cfg, ['info', '--json', `${cfg.repoPath}::${lastArchive.name}`])
        const infoJson = JSON.parse(infoOut) as BorgInfoJson
        sizeBytes = infoJson.cache?.stats?.original_size
      } catch {
        // non-fatal — carry on without size
      }
    }

    const lastBackupAt = lastArchive ? new Date(lastArchive.start) : undefined
    const ageMs        = lastBackupAt ? Date.now() - lastBackupAt.getTime() : Infinity
    const status       = ageMs < 26 * 60 * 60 * 1000 ? 'healthy' : 'warning'

    return {
      status,
      lastBackupAt,
      lastBackupStatus: lastArchive ? 'success' : 'unknown',
      sizeBytes,
      jobCount: archives.length,
      details: {
        repoPath:     cfg.repoPath,
        archiveCount: archives.length,
        lastArchive:  lastArchive?.name,
      },
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private runBorg(cfg: BorgConfig, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        BORG_PASSPHRASE: cfg.passphrase ?? '',
        BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK: 'yes',
      }

      if (cfg.sshKey) {
        env['BORG_RSH'] = `ssh -i ${cfg.sshKey} -o StrictHostKeyChecking=no`
      }

      const proc = spawn('borg', args, { env })
      const out: Buffer[] = []
      const err: Buffer[] = []

      proc.stdout.on('data', (c: Buffer) => out.push(c))
      proc.stderr.on('data', (c: Buffer) => err.push(c))

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(out).toString('utf8'))
        } else {
          reject(new Error(`borg exited ${code}: ${Buffer.concat(err).toString('utf8').trim()}`))
        }
      })

      proc.on('error', reject)
    })
  }
}
