import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/user'
import { getOidcConfigPublic } from '@/lib/oidc-config'
import { SsoForm } from './form'

export default async function SsoSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!isAdmin(user)) redirect('/dashboard')

  let cfg: ReturnType<typeof getOidcConfigPublic> = null
  try { cfg = getOidcConfigPublic() } catch { /* DB not migrated yet */ }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>OIDC Single Sign-On</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>
        Configure an OpenID Connect identity provider so users can sign in with Authentik, Okta, Duo, or any compliant OIDC IdP.
      </p>

      <div style={{
        padding: '12px 16px', marginBottom: 20,
        background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13, color: 'var(--warn)',
      }}>
        ⚠ Changes to SSO configuration require a BackupOS service restart to take effect:
        <code style={{ display: 'block', marginTop: 6, padding: '4px 8px', background: 'var(--surf2)', color: 'var(--fg)', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
          sudo systemctl restart backupos
        </code>
      </div>

      <div style={{
        padding: '12px 16px', marginBottom: 24,
        background: 'var(--surf2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13, color: 'var(--fg-mute)',
      }}>
        Redirect URI to register at your IdP:{' '}
        <code style={{ color: 'var(--fg)' }}>
          {process.env['NEXT_PUBLIC_BASE_URL'] ?? '<your-base-url>'}/api/auth/oauth2/callback/oidc
        </code>
      </div>

      <SsoForm initial={cfg} />
    </div>
  )
}
