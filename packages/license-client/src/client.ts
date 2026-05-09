import type { LicenseState, TierConfig } from './types'
import { getTierConfig } from './tiers'

// Stub client — all instances run Free tier until LicenseOS integration is live.
// Network validation will be wired here in a future PR.
export class LicenseClient {
  getState(): LicenseState {
    return { tier: 'free', licenseKey: null, expiresAt: null }
  }

  getTierConfig(): TierConfig {
    return getTierConfig(this.getState().tier)
  }
}
