'use server'

import { getDb, backupRuns, backupJobs, repositories } from '@backupos/db'
import { eq } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { requireUserAction } from '@/lib/user'

export interface PhaseEntry {
  startMs:    number
  durationMs: number
  status:     'ok' | 'error' | 'skipped'
}

export interface PhaseData {
  preHook?:      PhaseEntry
  backup?:       PhaseEntry
  postHook?:     PhaseEntry
  verification?: PhaseEntry
}

export interface RunDetail {
  id:           string
  status:       string
  startedAt:    Date | null
  completedAt:  Date | null
  log:          string | null
  phases:       PhaseData | null
  errorMessage: string | null
  jobId:        string | null
  progressPct:  number | null
  bytesDone:    number | null
  bytesTotal:   number | null
  filesDone:    number | null
  filesTotal:   number | null
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  await requireUserAction()
  if (typeof runId !== 'string' || runId.length === 0 || runId.length > 128) return null

  const db  = getDb()
  const row = await db.select({
    id:           backupRuns.id,
    status:       backupRuns.status,
    startedAt:    backupRuns.startedAt,
    completedAt:  backupRuns.completedAt,
    log:          backupRuns.log,
    phases:       backupRuns.phases,
    errorMessage: backupRuns.errorMessage,
    jobId:        backupRuns.jobId,
    progressPct:  backupRuns.progressPct,
    bytesDone:    backupRuns.bytesDone,
    bytesTotal:   backupRuns.bytesTotal,
    filesDone:    backupRuns.filesDone,
    filesTotal:   backupRuns.filesTotal,
  }).from(backupRuns).where(eq(backupRuns.id, runId)).get()

  if (!row) return null

  let phases: PhaseData | null = null
  if (row.phases) {
    try { phases = JSON.parse(row.phases) } catch { phases = null }
  }

  return { ...row, phases }
}

export async function getResticCommand(runId: string): Promise<string> {
  await requireUserAction()
  if (typeof runId !== 'string' || runId.length === 0 || runId.length > 128) return '# invalid run id'

  const db  = getDb()
  const run = await db.select({
    jobId:        backupRuns.jobId,
    repositoryId: backupRuns.repositoryId,
  }).from(backupRuns).where(eq(backupRuns.id, runId)).get()

  if (!run) return '# run not found'

  const job = run.jobId
    ? await db.select({ sourceType: backupJobs.sourceType, sourceConfig: backupJobs.sourceConfig })
        .from(backupJobs).where(eq(backupJobs.id, run.jobId)).get()
    : null

  const repo = run.repositoryId
    ? await db.select({ backend: repositories.backend, config: repositories.config })
        .from(repositories).where(eq(repositories.id, run.repositoryId)).get()
    : null

  const source = (() => {
    try { return (JSON.parse(job?.sourceConfig ?? '{}') as { path?: string })?.path ?? '/data' }
    catch { return '/data' }
  })()

  const repoPath = (() => {
    try {
      const cfg = JSON.parse(decryptField(repo?.config ?? '{}')) as { bucket?: string; path?: string }
      return cfg.bucket ? `${repo?.backend ?? 's3'}:${cfg.bucket}` : cfg.path ?? '/backup'
    } catch { return '/backup' }
  })()

  return `restic -r ${repoPath} backup ${source} --compression max`
}
