import { AsyncLocalStorage } from 'node:async_hooks'

// AsyncLocalStorage flag indicating the current async context is allowed
// to create a user via auth.api.signUpEmail. Without this flag set, the
// before-create hook in apps/web/lib/auth.ts will reject the call.
//
// Trusted callers wrap their auth.api.signUpEmail invocation:
//   await trustedSignup.run({}, async () => {
//     await auth.api.signUpEmail({ body: {...} })
//   })
//
// Untrusted callers (the public HTTP endpoint /api/auth/sign-up/email)
// do not have this context set and will be rejected.
export const trustedSignup = new AsyncLocalStorage<object>()

export function isTrustedSignupContext(): boolean {
  return trustedSignup.getStore() !== undefined
}
