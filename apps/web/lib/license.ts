import { getDb } from '@backupos/db'
import { licenseState } from '@backupos/db'
import { getTierConfig } from '@backupos/license-client'
import type { TierName, FeatureFlag, TierLimits } from '@backupos/license-client'

export class LicenseLimitError extends Error {
  constructor(resource: string, limit: number) {
    super(`Your ${tierDisplayName()} plan allows up to ${limit} ${resource}. Upgrade to add more.`)
    this.name = 'LicenseLimitError'
  }
}

export class LicenseFeatureError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available on the ${tierDisplayName()} plan. Upgrade to access this feature.`)
    this.name = 'LicenseFeatureError'
  }
}

function tierDisplayName(): string {
  // Called synchronously — returns a generic label; callers that need the
  // real tier embed it in the message via enforceLimit / requireFeature.
  return 'current'
}

async function getRow(): Promise<{ tier: TierName; licenseKey: string | null; expiresAt: Date | null }> {
  const db = getDb()
  const [row] = await db.select().from(licenseState).limit(1).all()
  if (!row) return { tier: 'free', licenseKey: null, expiresAt: null }
  return {
    tier:       (row.tier as TierName) ?? 'free',
    licenseKey: row.licenseKey ?? null,
    expiresAt:  row.expiresAt ?? null,
  }
}

export async function getLicenseState() {
  return getRow()
}

export async function getCurrentTierConfig() {
  const { tier } = await getRow()
  return getTierConfig(tier)
}

type LimitKey = keyof TierLimits

export async function enforceLimit(resource: LimitKey, currentCount: number): Promise<void> {
  const { tier } = await getRow()
  const cfg = getTierConfig(tier)
  const limit = cfg.limits[resource]
  if (limit === -1) return // unlimited
  if (currentCount >= limit) {
    throw new LicenseLimitError(resource, limit)
  }
}

export async function requireFeature(feature: FeatureFlag): Promise<void> {
  const { tier } = await getRow()
  const cfg = getTierConfig(tier)
  if (!cfg.features.includes(feature)) {
    throw new LicenseFeatureError(feature)
  }
}
