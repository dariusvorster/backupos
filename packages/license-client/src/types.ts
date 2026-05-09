export type TierName = 'free' | 'solo' | 'team' | 'business'

export type FeatureFlag =
  | 'oidc_sso'
  | 'multi_user_rbac'
  | 'compliance_export'
  | 'scheduled_verification'
  | 'priority_support'

export interface TierLimits {
  agents:        number  // -1 = unlimited
  repositories:  number
  operators:     number
  alertChannels: number
  apiTokens:     number
  retentionDays: number
}

export interface TierConfig {
  name:     TierName
  limits:   TierLimits
  features: FeatureFlag[]
}

export interface LicenseState {
  tier:       TierName
  licenseKey: string | null
  expiresAt:  Date | null
}
