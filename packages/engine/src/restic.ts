import { spawn } from 'child_process'
import type {
  ResticConfig,
  BackupOptions,
  BackupResult,
  CheckResult,
  ExecResult,
  ForgetResult,
  ResticBackupJson,
  ResticForgetJson,
  ResticSnapshotJson,
  ResticStatsJson,
  RepoStats,
  RestoreResult,
  RetentionPolicy,
  Snapshot,
} from './types'

export class ResticEngine {
  private readonly binary: string

  constructor(private readonly config: ResticConfig) {
    this.binary = config.binaryPath ?? 'restic'
  }

  async init(): Promise<void> {
    const result = await this.run(['init'])
    if (result.exitCode !== 0) {
      throw new ResticError('init', result)
    }
  }

  async backup(opts: BackupOptions): Promise<BackupResult> {
    if (opts.preHook) await opts.preHook()

    let backupError: Error | undefined
    let backupResult: BackupResult | undefined

    try {
      const args: string[] = ['backup', '--json']

      for (const path of opts.paths) args.push(path)
      if (opts.tags)        for (const t of opts.tags)    args.push('--tag',          t)
      if (opts.exclude)     for (const e of opts.exclude) args.push('--exclude',      e)
      if (opts.excludeFile)   args.push('--exclude-file', opts.excludeFile)
      if (opts.oneFileSystem) args.push('--one-file-system')
      if (opts.useVSS)        args.push('--use-fs-snapshot')

      const result = await this.run(args)
      if (result.exitCode !== 0) throw new ResticError('backup', result)

      const summary = this.parseSummaryLine(result.stdout)
      backupResult = {
        snapshotId:      summary.snapshot_id,
        filesNew:        summary.files_new,
        filesChanged:    summary.files_changed,
        filesUnmodified: summary.files_unmodified,
        dataAdded:       summary.data_added,
        totalSize:       summary.total_bytes_processed,
        duration:        Math.round(summary.total_duration),
      }
    } catch (err) {
      backupError = err instanceof Error ? err : new Error(String(err))
    }

    if (opts.postHook) await opts.postHook()

    if (backupError) throw backupError
    return backupResult!
  }

  async snapshots(tags?: string[]): Promise<Snapshot[]> {
    const args = ['snapshots', '--json']
    if (tags) for (const t of tags) args.push('--tag', t)

    const result = await this.run(args)
    if (result.exitCode !== 0) throw new ResticError('snapshots', result)

    const raw = JSON.parse(result.stdout) as ResticSnapshotJson[]
    return raw.map((s) => ({
      id:       s.id,
      time:     s.time,
      hostname: s.hostname,
      paths:    s.paths,
      tags:     s.tags,
      username: s.username,
    }))
  }

  async check(readData = false): Promise<CheckResult> {
    const args = ['check']
    if (readData) args.push('--read-data')

    const result = await this.run(args)
    const ok = result.exitCode === 0

    const lines = result.stderr.split('\n').filter(Boolean)
    return {
      ok,
      errors:   lines.filter((l) => l.includes('error')),
      warnings: lines.filter((l) => l.includes('warning')),
    }
  }

  async restore(
    snapshotId: string,
    target: string,
    include?: string[],
  ): Promise<RestoreResult> {
    const args = ['restore', snapshotId, '--target', target]
    if (include) for (const p of include) args.push('--include', p)

    const before = Date.now()
    const result = await this.run(args)
    if (result.exitCode !== 0) throw new ResticError('restore', result)

    const match = result.stderr.match(/(\d+) files? restored/)
    return {
      filesRestored: match ? parseInt(match[1]!, 10) : 0,
      totalSize: 0,
      duration: Math.round((Date.now() - before) / 1000),
    }
  }

  async forget(policy: RetentionPolicy, prune = true): Promise<ForgetResult> {
    const args = ['forget', '--json']

    if (policy.keepLast)    args.push('--keep-last',    String(policy.keepLast))
    if (policy.keepDaily)   args.push('--keep-daily',   String(policy.keepDaily))
    if (policy.keepWeekly)  args.push('--keep-weekly',  String(policy.keepWeekly))
    if (policy.keepMonthly) args.push('--keep-monthly', String(policy.keepMonthly))
    if (policy.keepYearly)  args.push('--keep-yearly',  String(policy.keepYearly))
    if (policy.keepTags)    for (const t of policy.keepTags) args.push('--keep-tag', t)
    if (prune) args.push('--prune')

    const result = await this.run(args)
    if (result.exitCode !== 0) throw new ResticError('forget', result)

    const raw = JSON.parse(result.stdout) as ResticForgetJson[]
    const entry = raw[0] ?? {}
    return {
      removed: entry.remove?.length ?? 0,
      kept:    entry.keep?.length   ?? 0,
    }
  }

  async stats(): Promise<RepoStats> {
    const result = await this.run(['stats', '--json'])
    if (result.exitCode !== 0) throw new ResticError('stats', result)

    const raw = JSON.parse(result.stdout) as ResticStatsJson
    return {
      totalSize:             raw.total_size,
      totalUncompressedSize: raw.total_uncompressed_size,
      compressionRatio:      raw.compression_ratio,
      totalBlobCount:        raw.total_blob_count,
      snapshotsCount:        raw.snapshots_count,
    }
  }

  // Non-blocking — caller must unmount when done
  mount(snapshotId: string, mountPoint: string): void {
    spawn(this.binary, ['mount', snapshotId, mountPoint], {
      env: this.buildEnv(),
      detached: true,
      stdio: 'ignore',
    }).unref()
  }

  async unmount(mountPoint: string): Promise<void> {
    const result = await this.run(['umount', mountPoint])
    if (result.exitCode !== 0) throw new ResticError('umount', result)
  }

  // ── Private ──────────────────────────────────────────────────────────────

  // Uses spawn (never shell — no injection possible)
  private run(
    args: string[],
    extraEnv?: Record<string, string>,
  ): Promise<ExecResult> {
    return new Promise((resolve) => {
      const proc = spawn(this.binary, args, { env: this.buildEnv(extraEnv) })

      const out: Buffer[] = []
      const err: Buffer[] = []

      proc.stdout.on('data', (chunk: Buffer) => out.push(chunk))
      proc.stderr.on('data', (chunk: Buffer) => err.push(chunk))

      proc.on('close', (code) => {
        resolve({
          stdout:   Buffer.concat(out).toString('utf8'),
          stderr:   Buffer.concat(err).toString('utf8'),
          exitCode: code ?? 1,
        })
      })

      proc.on('error', (e) => {
        resolve({ stdout: '', stderr: e.message, exitCode: 1 })
      })
    })
  }

  private buildEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    return {
      ...process.env,
      RESTIC_REPOSITORY: this.config.repositoryUrl,
      RESTIC_PASSWORD:   this.config.password,
      ...this.config.envVars,
      ...extra,
    }
  }

  private parseSummaryLine(stdout: string): ResticBackupJson {
    const lines = stdout.trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]!) as ResticBackupJson
        if (obj.message_type === 'summary') return obj
      } catch {
        // not JSON — keep scanning
      }
    }
    throw new Error('restic backup did not emit a summary JSON line')
  }
}

export class ResticError extends Error {
  constructor(
    public readonly command: string,
    public readonly result: ExecResult,
  ) {
    super(`restic ${command} failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
    this.name = 'ResticError'
  }
}
