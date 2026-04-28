import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user }    from '@backupos/db'
import { eq }             from '@backupos/db'
import { AvatarUpload }   from './avatar-upload'
import { updateProfile, uploadAvatar, removeAvatar } from '@/app/actions/user'

async function handleUpdateProfile(formData: FormData): Promise<void> {
  'use server'
  await updateProfile(formData)
  redirect('/settings/profile?saved=1')
}

async function handleUploadAvatar(formData: FormData): Promise<void> {
  'use server'
  await uploadAvatar(formData)
  redirect('/settings/profile?saved=1')
}

async function handleRemoveAvatar(): Promise<void> {
  'use server'
  await removeAvatar()
  redirect('/settings/profile?saved=1')
}


export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { saved } = await searchParams
  const db      = getDb()
  const profile = await db.select().from(user).where(eq(user.id, me.id)).get()
  if (!profile) redirect('/login')

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Profile</h1>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Profile saved.
        </div>
      )}

      {/* Avatar section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Avatar</h2>
        <AvatarUpload src={profile.image} name={profile.name} uploadAction={handleUploadAvatar} removeAction={handleRemoveAvatar} />
      </section>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 32 }} />

      {/* Personal info + contact prefs */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Personal information</h2>
        <form action={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {([
            { name: 'name',        label: 'Full name',    type: 'text', required: true,  value: profile.name },
            { name: 'displayName', label: 'Display name', type: 'text', required: false, value: profile.displayName ?? '' },
          ] as const).map(f => (
            <div key={f.name}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
                {f.label}{f.required ? ' *' : ''}
              </label>
              <input
                name={f.name} type={f.type} defaultValue={f.value} required={f.required}
                style={{
                  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                }}
              />
            </div>
          ))}

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Email</label>
            <input
              type="email" defaultValue={profile.email} disabled
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg-mute)', fontSize: 14,
              }}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Contact preferences</h2>
            {([
              { name: 'emailNotify',   label: 'Email notifications (master toggle)', checked: profile.emailNotify },
              { name: 'notifyAlerts',  label: 'Alerts',          checked: profile.notifyAlerts },
              { name: 'notifyWeekly',  label: 'Weekly summary',  checked: profile.notifyWeekly },
              { name: 'notifyUpdates', label: 'Product updates', checked: profile.notifyUpdates },
            ] as const).map(f => (
              <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" name={f.name} defaultChecked={f.checked} />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{f.label}</span>
              </label>
            ))}
          </div>

          <div>
            <button type="submit" style={{
              padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
