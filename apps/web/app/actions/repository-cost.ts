'use server'

import { revalidatePath } from 'next/cache'
import { getDb, repositories } from '@backupos/db'
import { eq } from 'drizzle-orm'

export async function saveCostConfig(repoId: string, formData: FormData): Promise<void> {
  const costStr   = ((formData.get('costPerGbMonth')    ?? '') as string).trim()
  const budgetStr = ((formData.get('monthlyBudgetCents') ?? '') as string).trim()

  const costPerGbMonth     = costStr   === '' ? null : Math.round(parseFloat(costStr) * 1000)
  const monthlyBudgetCents = budgetStr === '' ? null : Math.round(parseFloat(budgetStr) * 100)

  const db = getDb()
  await db.update(repositories)
    .set({ costPerGbMonth, monthlyBudgetCents })
    .where(eq(repositories.id, repoId))
    .run()

  revalidatePath(`/repositories/${repoId}`)
}
