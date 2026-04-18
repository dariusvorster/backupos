// Backend pricing data and cost estimation (spec section 19)

export interface BackendPricing {
  storagePerGBMonth: number   // USD
  egressPerGB: number         // USD
  putPer1000: number          // USD
  getPer1000: number          // USD
  minStorageDays?: number     // B2 has 1-day, Wasabi has 90-day minimum
  currency: 'USD'
}

export const BACKEND_PRICING: Record<string, BackendPricing> = {
  'cloudflare-r2': {
    storagePerGBMonth: 0.015,
    egressPerGB:       0,
    putPer1000:        0.0045,
    getPer1000:        0.00036,
    currency: 'USD',
  },
  'backblaze-b2': {
    storagePerGBMonth: 0.006,
    egressPerGB:       0.01,
    putPer1000:        0.004,
    getPer1000:        0.004,
    minStorageDays:    1,
    currency: 'USD',
  },
  'aws-s3-standard': {
    storagePerGBMonth: 0.023,
    egressPerGB:       0.09,
    putPer1000:        0.005,
    getPer1000:        0.0004,
    currency: 'USD',
  },
  'wasabi': {
    storagePerGBMonth: 0.0069,
    egressPerGB:       0,
    putPer1000:        0.0005,
    getPer1000:        0.0004,
    minStorageDays:    90,
    currency: 'USD',
  },
  'hetzner-storage-box': {
    storagePerGBMonth: 0.0057,
    egressPerGB:       0,
    putPer1000:        0,
    getPer1000:        0,
    currency: 'USD',
  },
  'sftp-custom': {
    storagePerGBMonth: 0,
    egressPerGB:       0,
    putPer1000:        0,
    getPer1000:        0,
    currency: 'USD',
  },
  'local': {
    storagePerGBMonth: 0,
    egressPerGB:       0,
    putPer1000:        0,
    getPer1000:        0,
    currency: 'USD',
  },
}

export interface CostEstimate {
  storageUSD: number
  egressUSD: number
  apiUSD: number
  totalUSD: number
  projectedAnnualUSD: number
  fullRestoreCostUSD: number
}

export interface RepoSnapshot {
  sizeBytes?: number
  monthlyPutCount?: number
  monthlyGetCount?: number
}

export function estimateMonthlyCost(
  repo: RepoSnapshot,
  pricing: BackendPricing,
  avgMonthlyRestoreGB = 0,
): CostEstimate {
  const sizeGB  = (repo.sizeBytes ?? 0) / 1e9
  const storage = sizeGB * pricing.storagePerGBMonth
  const egress  = avgMonthlyRestoreGB * pricing.egressPerGB
  const puts    = ((repo.monthlyPutCount ?? 0) / 1000) * pricing.putPer1000
  const gets    = ((repo.monthlyGetCount ?? 0) / 1000) * pricing.getPer1000

  return {
    storageUSD:         storage,
    egressUSD:          egress,
    apiUSD:             puts + gets,
    totalUSD:           storage + egress + puts + gets,
    projectedAnnualUSD: (storage + puts + gets) * 12,
    fullRestoreCostUSD: sizeGB * pricing.egressPerGB,
  }
}

export interface BackendRecommendation {
  backendKey: string
  pricing: BackendPricing
  estimate: CostEstimate
  annualSavingsVsCurrent: number
  caveats: string[]
}

export function recommendCheapestBackend(
  sizeGB: number,
  avgMonthlyRestoreGB: number,
): BackendRecommendation[] {
  const repo: RepoSnapshot = { sizeBytes: sizeGB * 1e9 }

  return Object.entries(BACKEND_PRICING)
    .map(([key, pricing]) => {
      const estimate = estimateMonthlyCost(repo, pricing, avgMonthlyRestoreGB)
      const caveats: string[] = []
      if (pricing.minStorageDays) {
        caveats.push(`${pricing.minStorageDays}-day minimum storage billing`)
      }
      if (pricing.egressPerGB > 0) {
        caveats.push(`$${pricing.egressPerGB}/GB egress costs on restore`)
      }
      return { backendKey: key, pricing, estimate, annualSavingsVsCurrent: 0, caveats }
    })
    .sort((a, b) => a.estimate.totalUSD - b.estimate.totalUSD)
}
