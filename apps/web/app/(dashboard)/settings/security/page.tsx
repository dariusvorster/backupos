import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user }    from '@backupos/db'
import { eq }             from '@backupos/db'
import { SecurityClient } from './client'
import { RotateKeyButton } from './RotateKeyButton'

export default async function SecurityPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db      = getDb()
  const profile = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, me.id)).get()

  return (
    <>
      <SecurityClient twoFactorEnabled={profile?.twoFactorEnabled ?? false} />
      <div style={{ maxWidth: 640 }}>
        <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 32px' }} />
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Encryption key</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16 }}>
            Rotate the server encryption key to re-encrypt all stored secrets (repository
            credentials, webhook tokens, SMTP password, etc.) under a new randomly-generated key.
            The service restarts automatically after a successful rotation. See{' '}
            <code style={{ fontSize: 12 }}>docs/SECURITY.md</code> for threat model and recovery steps.
          </p>
          <RotateKeyButton />
        </section>
      </div>
    </>
  )
}
