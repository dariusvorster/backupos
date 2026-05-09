import type { TierConfig, TierName } from './types'

const TIERS: Record<TierName, TierConfig> = {
  free: {
    name: 'free',
    limits: {
      agents:        1,
      repositories:  3,
      operators:     1,
      alertChannels: 1,
      apiTokens:     2,
      retentionDays: 30,
    },
    features: [],
  },
  solo: {
    name: 'solo',
    limits: {
      agents:        3,
      repositories:  10,
      operators:     1,
      alertChannels: 3,
      apiTokens:     10,
      retentionDays: 365,
    },
    features: [],
  },
  team: {
    name: 'team',
    limits: {
      agents:        10,
      repositories:  30,
      operators:     10,
      alertChannels: 10,
      apiTokens:     50,
      retentionDays: 365,
    },
    features: ['oidc_sso', 'multi_user_rbac', 'compliance_export', 'scheduled_verification'],
  },
  business: {
    name: 'business',
    limits: {
      agents:        -1,
      repositories:  -1,
      operators:     -1,
      alertChannels: -1,
      apiTokens:     -1,
      retentionDays: -1,
    },
    features: ['oidc_sso', 'multi_user_rbac', 'compliance_export', 'scheduled_verification', 'priority_support'],
  },
}

export function getTierConfig(tier: TierName): TierConfig {
  return TIERS[tier]
}
