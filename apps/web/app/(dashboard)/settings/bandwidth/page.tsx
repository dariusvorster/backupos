import { getDb, bandwidthProfiles, bandwidthRules } from '@backupos/db'
import { BandwidthProfileManager } from '@/components/bandwidth-profile-manager'
import { createProfile } from '@/app/actions/bandwidth'

export default async function BandwidthSettingsPage() {
  const db       = getDb()
  const profiles = await db.select().from(bandwidthProfiles).all()
  const rules    = await db.select().from(bandwidthRules).all()

  const profilesWithRules = profiles.map(p => ({
    ...p,
    rules: rules.filter(r => r.profileId === p.id),
  }))

  return (
    <div style={{ padding: '32px 40px', maxWidth: 800 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
          Bandwidth profiles
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
          Define time-of-day throttle schedules. Assign profiles to jobs or set one as the global default.
        </div>
      </div>

      <form action={createProfile} style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        <input
          name="name"
          placeholder="Profile name"
          required
          style={{
            padding: '7px 12px', fontSize: 13,
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', width: 200,
          }}
        />
        <input
          name="description"
          placeholder="Description (optional)"
          style={{
            padding: '7px 12px', fontSize: 13,
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', flex: 1, minWidth: 160,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" name="isGlobal" />
          Set as global default
        </label>
        <button type="submit" style={{
          padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--accent)', color: '#fff',
        }}>
          Create profile
        </button>
      </form>

      <BandwidthProfileManager profiles={profilesWithRules} />
    </div>
  )
}
