import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/user'
import { getDb, backupDefaults } from '@backupos/db'
import { saveBackupDefaults } from '@/app/actions/settings'
import { ViewOnlyBanner } from '@/components/ui/view-only-banner'

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
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

  const fields = [
    { name: 'keepLast',    label: 'Keep last N',   value: cfg?.keepLast    ?? 10 },
    { name: 'keepDaily',   label: 'Daily',         value: cfg?.keepDaily   ?? 7  },
    { name: 'keepWeekly',  label: 'Weekly',        value: cfg?.keepWeekly  ?? 4  },
    { name: 'keepMonthly', label: 'Monthly',       value: cfg?.keepMonthly ?? 12 },
    { name: 'keepYearly',  label: 'Yearly',        value: cfg?.keepYearly  ?? 0  },
  ] as const

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>Retention policy</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Default snapshot retention for new backup jobs. Individual jobs can override these.</p>

      {!canEdit && <ViewOnlyBanner />}

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      <form action={saveBackupDefaults}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fields.map(f => (
              <div key={f.name}>
                <label style={labelStyle}>{f.label} <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(snapshots)</span></label>
                <input name={f.name} type="number" min="0" defaultValue={f.value} style={inputStyle} disabled={!canEdit} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-faint)' }}>Set to 0 to disable that retention tier.</div>
        </div>
        <input type="hidden" name="scheduleStart" value={String(cfg?.scheduleStart ?? 0)} />
        <input type="hidden" name="scheduleEnd" value={String(cfg?.scheduleEnd ?? 23)} />
        <button type="submit" disabled={!canEdit} style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.5 }}>
          Save defaults
        </button>
      </form>
    </div>
  )
}
