'use server'

import { revalidatePath } from 'next/cache'
import { getDb, licenseState } from '@backupos/db'
import { eq } from '@backupos/db'
import { requireAdminAction } from '@/lib/user'
import type { TierName } from '@backupos/license-client'

export async function getLicenseSummary(): Promise<{
  tier: TierName
  licenseKey: string | null
  expiresAt: Date | null
}> {
  const db = getDb()
  const [row] = await db.select().from(licenseState).limit(1).all()
  if (!row) return { tier: 'free', licenseKey: null, expiresAt: null }
  return {
    tier:       (row.tier as TierName) ?? 'free',
    licenseKey: row.licenseKey ?? null,
    expiresAt:  row.expiresAt ?? null,
  }
}

export async function applyLicenseKey(_prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  await requireAdminAction()
  const key = (formData.get('licenseKey') as string | null)?.trim()
  if (!key) return { error: 'License key is required' }

  // Stub: accept any non-empty key and store it. Real validation lands when
  // LicenseOS is live — the client will verify the signature before persisting.
  const db = getDb()
  await db.insert(licenseState)
    .values({ id: 'singleton', tier: 'free', licenseKey: key, updatedAt: new Date() })
    .onConflictDoUpdate({ target: licenseState.id, set: { licenseKey: key, updatedAt: new Date() } })

  revalidatePath('/settings/license')
  return {}
}

export async function clearLicenseKey(): Promise<void> {
  await requireAdminAction()
  const db = getDb()
  await db.update(licenseState)
    .set({ licenseKey: null, tier: 'free', updatedAt: new Date() })
    .where(eq(licenseState.id, 'singleton'))
  revalidatePath('/settings/license')
}
