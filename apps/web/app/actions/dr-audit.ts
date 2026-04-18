'use server'

import { getDb, auditLog } from '@backupos/db'

interface LogDrActionInput {
  action:    'restore_file' | 'restore_database' | 'restore_host'
  jobId:     string
  target:    string
  dryRun:    boolean
  metadata?: Record<string, string>
}

export async function logDrAction(input: LogDrActionInput): Promise<void> {
  const db = getDb()
  await db.insert(auditLog).values({
    id:           crypto.randomUUID(),
    action:       input.action,
    resourceType: 'dr_restore',
    resourceId:   input.jobId,
    resourceName: input.target,
    actor:        'user',
    detail:       JSON.stringify({
      drMode: true,
      dryRun: input.dryRun,
      ...input.metadata,
    }),
    createdAt: new Date(),
  }).run()
}
