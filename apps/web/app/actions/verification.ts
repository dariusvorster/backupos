'use server'

import { revalidatePath } from 'next/cache'
import { getDb, verificationTests, verificationRuns, eq } from '@backupos/db'

export async function runVerification(testId: string): Promise<void> {
  const db    = getDb()
  const [test] = await db.select().from(verificationTests).where(eq(verificationTests.id, testId)).limit(1)
  if (!test) throw new Error('Verification test not found')

  const runId = crypto.randomUUID()
  const now   = new Date()

  await db.insert(verificationRuns).values({
    id:        runId,
    testId,
    status:    'failed',
    startedAt: now,
    completedAt: now,
    errorMessage: 'Verification engine requires a configured agent. Wire up agent connectivity to run tests.',
  })

  await db.update(verificationTests)
    .set({ lastResult: 'failed', lastRunAt: now })
    .where(eq(verificationTests.id, testId))

  revalidatePath(`/verification/${testId}`)
}
