import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user }    from '@backupos/db'
import { eq }             from 'drizzle-orm'
import { Avatar }         from '@/components/avatar'
import { updateProfile, uploadAvatar, removeAvatar } from '@/app/actions/user'

async function handleUpdateProfile(formData: FormData): Promise<void> {
  'use server'
  await updateProfile(formData)
}

async function handleUploadAvatar(formData: FormData): Promise<void> {
  'use server'
  await uploadAvatar(formData)
}

async function handleRemoveAvatar(): Promise<void> {
  'use server'
  await removeAvatar()
}

const TIMEZONES = [
  'UTC', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney',
]

export default async function ProfilePage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db      = getDb()
  const profile = await db.select().from(user).where(eq(user.id, me.id)).get()
  if (!profile) redirect('/login')

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Profile</h1>

      {/* Avatar section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Avatar</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar src={profile.image} name={profile.name} size={80} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <form action={handleUploadAvatar}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                color: 'var(--fg)', backgroundColor: 'var(--surf2)',
              }}>
                Upload image
                <input
                  name="avatar" type="file" accept=".jpg,.jpeg,.png,.webp"
                  style={{ display: 'none' }}
                />
              </label>
              <button type="submit" style={{
                marginTop: 6, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                color: 'var(--fg)', backgroundColor: 'var(--surf2)', display: 'block',
              }}>Upload</button>
            </form>
            <form action={handleRemoveAvatar}>
              <button type="submit" style={{
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                color: 'var(--fg-mute)', backgroundColor: 'transparent',
              }}>Remove</button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Self-hosted: stored locally. Max 1 MB, JPG/PNG/WebP.</p>
          </div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 32 }} />

      {/* Personal info + contact prefs */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Personal information</h2>
        <form action={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {([
            { name: 'name',        label: 'Full name',    type: 'text', required: true,  value: profile.name },
            { name: 'displayName', label: 'Display name', type: 'text', required: false, value: profile.displayName ?? '' },
            { name: 'phone',       label: 'Phone number', type: 'tel',  required: false, value: profile.phone ?? '' },
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

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Timezone</label>
            <select name="timezone" defaultValue={profile.timezone} style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
            }}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Language</label>
            <select name="language" defaultValue={profile.language} style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
            }}>
              <option value="en">English</option>
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Contact preferences</h2>
            {([
              { name: 'emailNotify',   label: 'Email notifications (master toggle)', checked: profile.emailNotify },
              { name: 'smsNotify',     label: 'SMS notifications (requires verified phone)', checked: profile.smsNotify },
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
