import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor as twoFactorPlugin, genericOAuth } from 'better-auth/plugins'
import { getDb, user, session, account, verification, twoFactor, eq } from '@backupos/db'
import { isPrivateOrigin } from './private-origin'
import { getOidcConfigDecrypted } from './oidc-config'

function buildPlugins(): ReturnType<typeof twoFactorPlugin>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [twoFactorPlugin({ issuer: 'BackupOS' })]

  // Conditionally load genericOAuth from DB config.
  // NOTE: This runs at module-init. Changes to /settings/auth/sso require service restart.
  // TODO #187 follow-up: wire databaseHooks.session.create to record user.login.sso vs user.login
  // based on the account row's providerId. Currently login events are not audited at all
  // because better-auth doesn't expose a clean post-login hook in this version.
  let oidc: ReturnType<typeof getOidcConfigDecrypted> = null
  try {
    oidc = getOidcConfigDecrypted()
  } catch {
    // DB may not be migrated yet on first boot; skip silently.
  }

  if (oidc?.enabled) {
    plugins.push(genericOAuth({
      config: [{
        providerId:   'oidc',
        discoveryUrl: oidc.discoveryUrl,
        clientId:     oidc.clientId,
        clientSecret: oidc.clientSecret,
        scopes:       oidc.scopes.split(/\s+/).filter(Boolean),
        pkce:         true,
        mapProfileToUser: (profile: Record<string, unknown>) => ({
          email: profile['email'] as string,
          name:  (profile['name'] || profile['preferred_username'] || profile['email']) as string,
        }),
      }],
    }))
  }

  return plugins
}

const explicitTrusted = process.env['BETTER_AUTH_TRUSTED_ORIGINS']
  ?.split(',').map(s => s.trim()).filter(Boolean) ?? []

export const auth = betterAuth({
  baseURL: process.env['BETTER_AUTH_URL'],
  trustedOrigins: (request?: Request) => {
    const origin = request?.headers.get('origin') ?? ''
    return isPrivateOrigin(origin) ? [...explicitTrusted, origin] : explicitTrusted
  },
  plugins: buildPlugins(),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['oidc'],
    },
  },
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema: { user, session, account, verification, twoFactor },
  }),
  emailAndPassword: {
    enabled:    true,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 15,
    sendResetPassword: async ({ user: u, url }: { user: { email: string }; url: string }) => {
      const base = process.env['NEXT_PUBLIC_BASE_URL'] ?? process.env['BETTER_AUTH_URL'] ?? ''
      const link = url
        .replace(/^https?:\/\/[^/]+/, base)
        .replace('/api/auth/reset-password', '/reset-password')
      const { sendResetPasswordEmail } = await import('./mailer')
      await sendResetPasswordEmail({ to: u.email, link })
    },
    onPasswordReset: async ({ user: u }: { user: { id: string; email: string } }) => {
      const db = getDb()
      await db.delete(session).where(eq(session.userId, u.id))
      try {
        const { sendPasswordChangedNotification } = await import('./mailer')
        await sendPasswordChangedNotification({ to: u.email })
      } catch { /* non-fatal */ }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge:  60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge:  60 * 5,
    },
  },
  rateLimit: {
    enabled: true,
    window:  60,
    max:     10,
  },
  advanced: {
    useSecureCookies: process.env['BETTER_AUTH_URL']?.startsWith('https://') ?? false,
  },
})

export type Session = typeof auth.$Infer.Session
export type User    = typeof auth.$Infer.Session.user
