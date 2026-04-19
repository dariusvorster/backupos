// apps/web/lib/growth-forecast.ts

export interface SnapshotDataPoint {
  date:      Date
  sizeBytes: number
}

export interface ForecastPoint {
  date:      Date
  sizeBytes: number
  lower:     number
  upper:     number
}

export interface GrowthForecast {
  history:         SnapshotDataPoint[]
  forecast:        ForecastPoint[]
  dailyGrowthBytes: number
  plateauMonth:    number | null
  plateauBytes:    number | null
  currentGb:       number
  forecastGb12mo:  number
  currentCostCents:   number | null
  forecast12moCents:  number | null
  budgetExceededMonth: number | null
}

export const BACKEND_PRESETS: Record<string, { label: string; costPerGbMonth: number }> = {
  s3:    { label: 'AWS S3',          costPerGbMonth: 2300  },
  r2:    { label: 'Cloudflare R2',   costPerGbMonth: 1500  },
  b2:    { label: 'Backblaze B2',    costPerGbMonth:  600  },
  sftp:  { label: 'SFTP / Self-hosted', costPerGbMonth: 0  },
  local: { label: 'Local disk',      costPerGbMonth: 0     },
  rclone:{ label: 'Rclone',          costPerGbMonth: 1500  },
}

const MS_PER_DAY = 86_400_000

function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; stdErr: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, stdErr: 0 }

  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n

  let ssXX = 0, ssXY = 0, ssYY = 0
  for (const p of points) {
    ssXX += (p.x - meanX) ** 2
    ssXY += (p.x - meanX) * (p.y - meanY)
    ssYY += (p.y - meanY) ** 2
  }

  const slope     = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = meanY - slope * meanX

  const residuals = points.map(p => p.y - (slope * p.x + intercept))
  const mse       = residuals.reduce((s, r) => s + r ** 2, 0) / Math.max(n - 2, 1)
  const stdErr    = Math.sqrt(mse / ssXX) * Math.sqrt(ssXX + meanX ** 2 / n)

  return { slope, intercept, stdErr }
}

export function computeForecast(
  history:          SnapshotDataPoint[],
  retentionMonths:  number | null,
  costPerGbMonth:   number | null,
  monthlyBudgetCents: number | null,
): GrowthForecast {
  const now     = new Date()
  const t0      = now.getTime()

  // Use up to last 30 snapshots, sorted oldest→newest
  const sorted  = [...history].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-30)

  // Build regression points (x = days from first snapshot, y = sizeBytes)
  const t_first = sorted[0]?.date.getTime() ?? t0
  const points  = sorted.map(s => ({ x: (s.date.getTime() - t_first) / MS_PER_DAY, y: s.sizeBytes }))
  const reg     = linearRegression(points)

  const dailyGrowthBytes = Math.max(0, reg.slope)

  // Build 12-month forecast (one point per month)
  const forecast: ForecastPoint[] = []
  const t_now_days = (t0 - t_first) / MS_PER_DAY
  const baseSize   = reg.slope * t_now_days + reg.intercept

  for (let m = 1; m <= 12; m++) {
    const daysAhead = m * 30.44
    const projected = baseSize + dailyGrowthBytes * daysAhead
    const halfCI    = reg.stdErr * 1.645 * Math.sqrt(daysAhead) // 90% CI
    forecast.push({
      date:      new Date(t0 + daysAhead * MS_PER_DAY),
      sizeBytes: Math.max(0, projected),
      lower:     Math.max(0, projected - halfCI),
      upper:     Math.max(0, projected + halfCI),
    })
  }

  // Plateau estimation: if retention policy limits history, growth flattens
  let plateauMonth: number | null  = null
  let plateauBytes: number | null  = null
  if (retentionMonths !== null && retentionMonths > 0 && dailyGrowthBytes > 0) {
    const plateauSizeBytes = dailyGrowthBytes * retentionMonths * 30.44
    const monthsToReach    = forecast.findIndex(f => f.sizeBytes >= plateauSizeBytes)
    if (monthsToReach >= 0) {
      plateauMonth = monthsToReach + 1
      plateauBytes = plateauSizeBytes
    }
  }

  const currentGb      = (sorted[sorted.length - 1]?.sizeBytes ?? 0) / 1_073_741_824
  const forecastGb12mo = (forecast[11]?.sizeBytes ?? 0) / 1_073_741_824

  const currentCostCents   = costPerGbMonth !== null ? Math.round(currentGb * costPerGbMonth / 1000) : null
  const forecast12moCents  = costPerGbMonth !== null ? Math.round(forecastGb12mo * costPerGbMonth / 1000) : null

  let budgetExceededMonth: number | null = null
  if (monthlyBudgetCents !== null && costPerGbMonth !== null) {
    const exceededIdx = forecast.findIndex(f => {
      const gb   = f.sizeBytes / 1_073_741_824
      const cost = Math.round(gb * costPerGbMonth / 1000)
      return cost > monthlyBudgetCents
    })
    if (exceededIdx >= 0) budgetExceededMonth = exceededIdx + 1
  }

  return {
    history:         sorted,
    forecast,
    dailyGrowthBytes,
    plateauMonth,
    plateauBytes,
    currentGb,
    forecastGb12mo,
    currentCostCents,
    forecast12moCents,
    budgetExceededMonth,
  }
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function fmtGb(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

export function fmtGbPerMonth(bytesPerDay: number): string {
  const gbPerMonth = (bytesPerDay * 30.44) / 1_073_741_824
  if (gbPerMonth < 0.1) return `< 0.1 GB/mo`
  return `${gbPerMonth.toFixed(1)} GB/mo`
}
