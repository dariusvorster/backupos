import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/user'
import { getDb, backupDefaults } from '@backupos/db'
import { saveBackupDefaults } from '@/app/actions/settings'
import { ViewOnlyBanner } from '@/components/ui/view-only-banner'

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00`,
}))

export default async function ScheduleWindowsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const canEdit = isAdmin(user)

  const { saved } = await searchParams
  const db = getDb()
  const [cfg] = await db.select().from(backupDefaults).limit(1).all()

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Schedule windows</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Default time window for backup jobs. Individual jobs can override this.</p>

      {!canEdit && <ViewOnlyBanner />}

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      <form action={saveBackupDefaults}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Window start</label>
              <select name="scheduleStart" defaultValue={cfg?.scheduleStart ?? 0} style={inputStyle} disabled={!canEdit}>
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Window end</label>
              <select name="scheduleEnd" defaultValue={cfg?.scheduleEnd ?? 23} style={inputStyle} disabled={!canEdit}>
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-faint)' }}>
            Backups scheduled during this window will run immediately. Outside this window they will be delayed to the next window start.
          </div>
        </div>
        <input type="hidden" name="_page"       value="schedule" />
        <input type="hidden" name="keepLast"    value={String(cfg?.keepLast    ?? 10)} />
        <input type="hidden" name="keepDaily"   value={String(cfg?.keepDaily   ?? 7)}  />
        <input type="hidden" name="keepWeekly"  value={String(cfg?.keepWeekly  ?? 4)}  />
        <input type="hidden" name="keepMonthly" value={String(cfg?.keepMonthly ?? 12)} />
        <input type="hidden" name="keepYearly"  value={String(cfg?.keepYearly  ?? 0)}  />
        <button type="submit" disabled={!canEdit} style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.5 }}>
          Save defaults
        </button>
      </form>
    </div>
  )
}
