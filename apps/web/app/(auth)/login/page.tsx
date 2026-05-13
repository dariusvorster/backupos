import { redirect } from 'next/navigation'
import { getDb, user } from '@backupos/db'
import { LoginForm } from './form'
import { getOidcConfigPublic } from '@/lib/oidc-config'

export default async function LoginPage() {
  const db = getDb()
  const [existing] = await db.select({ id: user.id }).from(user).limit(1).all()

  // No users yet — send to first-run setup
  if (!existing) redirect('/signup')

  let oidc: ReturnType<typeof getOidcConfigPublic> = null
  try { oidc = getOidcConfigPublic() } catch { /* DB not migrated yet */ }

  return (
    <LoginForm
      ssoEnabled={!!oidc?.enabled}
      ssoButtonLabel={oidc?.buttonLabel ?? 'Sign in with SSO'}
      hasUsers={true}
    />
  )
}
