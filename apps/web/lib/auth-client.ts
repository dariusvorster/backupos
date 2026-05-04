'use client'

import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'

interface TwoFactorResult<T> {
  data: T | null
  error: { message?: string; status?: number } | null
}

interface TwoFactorMethods {
  enable(opts?: { password?: string }): Promise<TwoFactorResult<{ totpURI: string; backupCodes: string[] }>>
  disable(opts?: { password?: string }): Promise<TwoFactorResult<{ status: boolean }>>
  verifyTotp(opts: { code: string; trustDevice?: boolean }): Promise<TwoFactorResult<unknown>>
  verifyBackupCode(opts: { code: string; trustDevice?: boolean }): Promise<TwoFactorResult<unknown>>
}

interface AuthMethods {
  forgetPassword(opts: { email: string; redirectTo?: string }): Promise<TwoFactorResult<{ status: boolean }>>
  resetPassword(opts: { newPassword: string; token: string }): Promise<TwoFactorResult<{ status: boolean }>>
}

interface SignInExtensions {
  oauth2(opts: { providerId: string; callbackURL?: string }): Promise<{ data: { url: string; redirect: boolean } | null; error: { message?: string } | null }>
}

type AuthClientType = ReturnType<typeof createAuthClient> & {
  twoFactor: TwoFactorMethods
  signIn:    ReturnType<typeof createAuthClient>['signIn'] & SignInExtensions
} & AuthMethods

// Explicit cast avoids TS2742 "inferred type cannot be named" from better-auth internals.
// twoFactor methods are manually typed against the plugin's documented API.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [twoFactorClient({ twoFactorPage: '/login/two-factor' })],
}) as unknown as AuthClientType
