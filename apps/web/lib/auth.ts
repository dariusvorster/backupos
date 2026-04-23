import { betterAuth }     from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb, user, session, account, verification } from '@backupos/db'

export const auth = betterAuth({
  baseURL: process.env['BETTER_AUTH_URL'],
  trustedOrigins: process.env['BETTER_AUTH_TRUSTED_ORIGINS']?.split(',').map(s => s.trim()) ?? [],
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled:    true,
    autoSignIn: true,
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
