import { createAuthClient } from 'better-auth/react'

// Explicit type avoids TS2742 "inferred type cannot be named" error caused by
// better-auth referencing internal .mjs path types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
}) as ReturnType<typeof createAuthClient> & Record<string, any>
