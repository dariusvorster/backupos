import { spawnAllowed as spawn } from './exec-allowed'
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
  ResticStatusJson,
  RepoStats,
  RestoreResult,
  RetentionPolicy,
  Snapshot,
  SnapshotFile,
  ResticLsNodeJson,
} from './types'

const MAX_LOG_BYTES = 1_000_000

function buildRunLog(stdout: string, stderr: string): string {
  const logLines: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { message_type?: string }
        if (parsed.message_type === 'status') continue
      } catch { /* not JSON — keep the line */ }
    }
    logLines.push(line)
  }
  for (const line of stderr.split('\n')) {
    if (line.trim()) logLines.push(`[stderr] ${line}`)
  }
  const full = logLines.join('\n')
  if (full.length > MAX_LOG_BYTES) {
    return full.slice(-MAX_LOG_BYTES) + '\n[log truncated to last 1MB]'
  }
  return full
}

export class ResticEngine {
  private readonly binary: string

  constructor(private readonly config: ResticConfig) {
    this.binary = config.binaryPath ?? 'restic'
  }

  async init(): Promise<{ log: string }> {
    const result = await this.run(['init'], undefined, 60_000)
    const log = buildRunLog(result.stdout, result.stderr)
    if (result.exitCode !== 0) {
      throw new ResticError('init', result)
    }
    return { log }
  }

  async backup(opts: BackupOptions): Promise<BackupResult> {
    if (opts.preHook) await opts.preHook()

    let backupError: Error | undefined
    let backupResult: BackupResult | undefined

    try {
      const args: string[] = ['backup', '--json', '--no-scan']

      for (const path of opts.paths) args.push(path)
      if (opts.tags)        for (const t of opts.tags)    args.push('--tag',          t)
      if (opts.exclude)     for (const e of opts.exclude) args.push('--exclude',      e)
      if (opts.excludeFile)   args.push('--exclude-file', opts.excludeFile)
      if (opts.oneFileSystem) args.push('--one-file-system')
      if (opts.useVSS)        args.push('--use-fs-snapshot')
      if (this.config.bandwidthLimitKbps && this.config.bandwidthLimitKbps > 0) {
        args.push('--limit-upload',   String(this.config.bandwidthLimitKbps))
        args.push('--limit-download', String(this.config.bandwidthLimitKbps))
      }

      const result = await this.runStreaming(
        args,
        opts.onProgress
          ? (line) => {
              try {
                const obj = JSON.parse(line) as { message_type: string }
                if (obj.message_type === 'status') {
                  const s = obj as unknown as ResticStatusJson
                  opts.onProgress!({
                    pct:              s.percent_done,
                    bytesDone:        s.bytes_done,
                    bytesTotal:       s.total_bytes,
                    filesDone:        s.files_done,
                    filesTotal:       s.total_files,
                    secondsElapsed:   s.seconds_elapsed,
                    secondsRemaining: s.seconds_remaining,
                  })
                }
              } catch { /* not JSON */ }
            }
          : undefined,
        undefined,
        14_400_000,
        opts.signal,
      )
      if (result.exitCode !== 0) throw new ResticError('backup', result)

      const summary = this.parseSummaryLine(result.stdout)
      backupResult = {
        snapshotId:      summary.snapshot_id,
        filesNew:        summary.files_new,
        filesChanged:    summary.files_changed,
        filesUnmodified: summary.files_unmodified,
        dataAdded:       summary.data_added,
        totalSize:       summary.total_bytes_processed,
        duration:        Math.round((summary.total_duration ?? 0) * 1000),
        log:             buildRunLog(result.stdout, result.stderr),
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

    const result = await this.run(args, undefined, 30_000)
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

  async ls(snapshotId: string): Promise<SnapshotFile[]> {
    const result = await this.run(['ls', snapshotId, '--json'], undefined, 30_000)
    if (result.exitCode !== 0) throw new ResticError('ls', result)

    const files: SnapshotFile[] = []
    for (const line of result.stdout.trim().split('\n')) {
      if (!line) continue
      const obj = JSON.parse(line) as ResticLsNodeJson
      if (obj.struct_type !== 'node') continue
      files.push({
        name:        obj.name,
        type:        obj.type,
        path:        obj.path,
        size:        obj.size,
        mtime:       obj.mtime,
        permissions: obj.permissions,
      })
    }
    return files
  }

  async check(readData = false): Promise<CheckResult> {
    const args = ['check']
    if (readData) args.push('--read-data')
    if (this.config.bandwidthLimitKbps && this.config.bandwidthLimitKbps > 0) {
      args.push('--limit-upload',   String(this.config.bandwidthLimitKbps))
      args.push('--limit-download', String(this.config.bandwidthLimitKbps))
    }

    const result = await this.run(args, undefined, 1_800_000)
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
    signal?: AbortSignal,
  ): Promise<RestoreResult> {
    const args = ['restore', snapshotId, '--target', target, '--json']
    if (include) for (const p of include) args.push('--include', p)
    if (this.config.bandwidthLimitKbps && this.config.bandwidthLimitKbps > 0) {
      args.push('--limit-upload',   String(this.config.bandwidthLimitKbps))
      args.push('--limit-download', String(this.config.bandwidthLimitKbps))
    }

    const before = Date.now()
    const result = await this.run(args, undefined, 14_400_000, signal)
    if (result.exitCode !== 0) throw new ResticError('restore', result)

    let filesRestored = 0
    let totalSize = 0
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const parsed = JSON.parse(trimmed) as {
          message_type?: string
          files_restored?: number
          bytes_restored?: number
        }
        if (parsed.message_type === 'summary') {
          filesRestored = parsed.files_restored ?? 0
          totalSize     = parsed.bytes_restored ?? 0
        }
      } catch { /* skip non-JSON lines */ }
    }

    if (filesRestored === 0 && result.stdout.length > 0) {
      console.warn(`[restic] restore parsed 0 files but stdout is non-empty (${result.stdout.length} chars). First 500 chars:`)
      console.warn(result.stdout.slice(0, 500))
    }

    return {
      filesRestored,
      totalSize,
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

    const result = await this.run(args, undefined, 1_800_000)
    if (result.exitCode !== 0) throw new ResticError('forget', result)

    const raw = JSON.parse(result.stdout) as ResticForgetJson[]
    const entry = raw[0] ?? {}
    return {
      removed: entry.remove?.length ?? 0,
      kept:    entry.keep?.length   ?? 0,
    }
  }

  async prune(): Promise<void> {
    const result = await this.run(['prune'], undefined, 1_800_000)
    if (result.exitCode !== 0) throw new ResticError('prune', result)
  }

  async stats(): Promise<RepoStats> {
    const result = await this.run(['stats', '--json'], undefined, 30_000)
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
    const result = await this.run(['umount', mountPoint], undefined, 30_000)
    if (result.exitCode !== 0) throw new ResticError('umount', result)
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private run(
    args: string[],
    extraEnv?: Record<string, string>,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<ExecResult> {
    return this.runStreaming(args, undefined, extraEnv, timeoutMs, signal)
  }

  private runStreaming(
    args: string[],
    onLine?: (line: string) => void,
    extraEnv?: Record<string, string>,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binary, args, {
        env:   this.buildEnv(extraEnv),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let settled = false

      if (signal) {
        signal.addEventListener('abort', () => {
          if (settled) return
          proc.kill('SIGTERM')
          setTimeout(() => {
            if (!proc.killed && proc.exitCode === null) proc.kill('SIGKILL')
          }, 10_000)
        }, { once: true })
      }
      const outLines: string[] = []
      const err: Buffer[] = []
      let partial = ''

      let timer: ReturnType<typeof setTimeout> | undefined
      if (timeoutMs) {
        timer = setTimeout(() => {
          if (settled) return
          settled = true
          proc.kill('SIGTERM')
          setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 10_000)
          reject(new Error(`restic timed out after ${timeoutMs}ms during ${args[0] ?? 'unknown'}`))
        }, timeoutMs)
      }

      proc.stdout!.on('data', (chunk: Buffer) => {
        const text = partial + chunk.toString('utf8')
        const parts = text.split('\n')
        partial = parts.pop() ?? ''
        for (const line of parts) {
          outLines.push(line)
          if (onLine) onLine(line)
        }
      })

      proc.stderr!.on('data', (chunk: Buffer) => err.push(chunk))

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (partial) {
          outLines.push(partial)
          if (onLine) onLine(partial)
        }
        resolve({
          stdout:   outLines.join('\n'),
          stderr:   Buffer.concat(err).toString('utf8'),
          exitCode: code ?? 1,
        })
      })

      proc.on('error', (e) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
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
