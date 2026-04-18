// apps/web/lib/bandwidth.ts

export const UNLIMITED_KBPS = 102_400 // 100 MB/s sentinel for "no throttle"

export interface BandwidthRule {
  startHour: number
  endHour:   number
  limitKbps: number | null
}

export function getActiveRule(rules: BandwidthRule[], hour: number): BandwidthRule | null {
  return rules.find(r => hour >= r.startHour && hour < r.endHour) ?? null
}

export function fmtLimit(limitKbps: number | null): string {
  if (limitKbps === null) return 'Unlimited'
  if (limitKbps >= 1024) return `${(limitKbps / 1024).toFixed(0)} MB/s`
  return `${limitKbps} KB/s`
}

export function build24hSparklineValues(rules: BandwidthRule[]): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    const rule = getActiveRule(rules, h)
    if (!rule || rule.limitKbps === null) return UNLIMITED_KBPS
    return rule.limitKbps
  })
}
