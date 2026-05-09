import type { TierConfig, TierName } from './types'

const TIERS: Record<TierName, TierConfig> = {
  free: {
    name: 'free',
    limits: {
      agents:        3,
      repositories:  2,
      operators:     1,
      alertChannels: 1,
      apiTokens:     0,
      retentionDays: 30,
    },
    features: [],
  },
  solo: {
    name: 'solo',
    limits: {
      agents:        10,
      repositories:  5,
      operators:     1,
      alertChannels: 9,
      apiTokens:     1,
      retentionDays: -1,
    },
    features: ['scheduled_verification'],
  },
  team: {
    name: 'team',
    limits: {
      agents:        50,
      repositories:  25,
      operators:     10,
      alertChannels: 9,
      apiTokens:     10,
      retentionDays: -1,
    },
    features: ['scheduled_verification', 'oidc_sso', 'multi_user_rbac', 'compliance_export'],
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
    features: ['scheduled_verification', 'oidc_sso', 'multi_user_rbac', 'compliance_export', 'priority_support'],
  },
}

export function getTierConfig(tier: TierName): TierConfig {
  return TIERS[tier]
}
