import { getLoggingConfig, saveLoggingConfig } from '@/app/actions/logging-config'

const ACTIVITY_OPTIONS = ['30d', '90d', '180d', '365d', 'forever']
const AUDIT_OPTIONS    = ['90d', '365d', '3y', '7y', 'forever']
const OPS_OPTIONS      = ['7d', '14d', '30d', '90d']

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 20px', borderTop: '1px solid var(--border)', fontSize: 13,
}
const selectStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', cursor: 'pointer',
}

export default async function LoggingSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const config = await getLoggingConfig()
  const { saved } = await searchParams

  return (
    <div style={{ maxWidth: 560 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Logging</h1>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      <form action={saveLoggingConfig}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Retention periods
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--fg)' }}>Activity feed</span>
            <select name="activityRetention" defaultValue={config.activityRetention} style={selectStyle}>
              {ACTIVITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--fg)' }}>Audit log</span>
            <select name="auditRetention" defaultValue={config.auditRetention} style={selectStyle}>
              {AUDIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--fg)' }}>Operational logs</span>
            <select name="opsRetention" defaultValue={config.opsRetention} style={selectStyle}>
              {OPS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" style={{
          padding: '8px 20px', fontSize: 13, fontWeight: 500,
          borderRadius: 'var(--radius-sm)', border: 'none',
          backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
        }}>
          Save
        </button>
      </form>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 24, padding: '14px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Last sweep</div>
        {config.lastSweepAt ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
              {config.lastSweepAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7 }}>
              · {config.lastSweepDeletedAlerts.toLocaleString()} alerts pruned<br />
              · {config.lastSweepDeletedAudit.toLocaleString()} audit entries pruned<br />
              · {config.lastSweepDeletedOps.toLocaleString()} operational logs pruned
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>never (next run at 03:00 UTC)</div>
        )}
      </div>
    </div>
  )
}
