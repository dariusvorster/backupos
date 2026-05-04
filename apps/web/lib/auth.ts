import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor as twoFactorPlugin } from 'better-auth/plugins'
import { getDb, user, session, account, verification, twoFactor, eq } from '@backupos/db'
import { isPrivateOrigin } from './private-origin'

const explicitTrusted = process.env['BETTER_AUTH_TRUSTED_ORIGINS']
  ?.split(',').map(s => s.trim()).filter(Boolean) ?? []

export const auth = betterAuth({
  baseURL: process.env['BETTER_AUTH_URL'],
  trustedOrigins: (request?: Request) => {
    const origin = request?.headers.get('origin') ?? ''
    return isPrivateOrigin(origin) ? [...explicitTrusted, origin] : explicitTrusted
  },
  plugins: [twoFactorPlugin({ issuer: 'BackupOS' })],
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
