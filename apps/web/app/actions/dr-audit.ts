'use server'

import { getDb, auditLog } from '@backupos/db'
import { requireUserAction } from '@/lib/user'

interface LogDrActionInput {
  action:    'restore_file' | 'restore_database' | 'restore_host'
  jobId:     string
  target:    string
  dryRun:    boolean
  metadata?: Record<string, string>
}

export async function logDrAction(input: LogDrActionInput): Promise<void> {
  const user = await requireUserAction()
  if (
    !input ||
    !['restore_file', 'restore_database', 'restore_host'].includes(input.action) ||
    typeof input.jobId !== 'string' ||
    typeof input.target !== 'string' ||
    typeof input.dryRun !== 'boolean'
  ) {
    throw new Error('Invalid DR audit input')
  }

  const db = getDb()
  await db.insert(auditLog).values({
    id:           crypto.randomUUID(),
    action:       input.action,
    resourceType: 'dr_restore',
    resourceId:   input.jobId.slice(0, 128),
    resourceName: input.target.slice(0, 512),
    actor:        user.email ?? user.id,
    detail:       JSON.stringify({
      drMode: true,
      dryRun: input.dryRun,
      ...input.metadata,
    }),
    createdAt: new Date(),
  }).run()
}
