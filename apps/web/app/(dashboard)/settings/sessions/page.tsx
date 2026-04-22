import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/user'
import { getDb, session, eq } from '@backupos/db'

export default async function SessionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const db = getDb()
  const sessions = await db.select().from(session)
    .where(eq(session.userId, user.id)).all()

  async function revokeSession(formData: FormData) {
    'use server'
    const id = formData.get('sessionId') as string
    if (!id) return
    const db2 = getDb()
    await db2.delete(session).where(eq(session.id, id))
    revalidatePath('/settings/sessions')
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Session management</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>View and revoke active login sessions.</p>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Active sessions ({sessions.length})
        </div>
        {sessions.map((s, i) => (
          <div key={s.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                {s.ipAddress ?? 'Unknown IP'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 3 }}>
                {s.userAgent ? s.userAgent.slice(0, 60) + (s.userAgent.length > 60 ? '…' : '') : 'Unknown browser'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
                Expires {s.expiresAt.toLocaleDateString()} · Created {s.createdAt.toLocaleDateString()}
              </div>
            </div>
            <form action={revokeSession}>
              <input type="hidden" name="sessionId" value={s.id} />
              <button type="submit" style={{ padding: '4px 10px', backgroundColor: 'var(--surf2)', color: 'var(--fg-dim)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer' }}>
                Revoke
              </button>
            </form>
          </div>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>No active sessions.</div>
        )}
      </div>
    </div>
  )
}
