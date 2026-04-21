import { getDb, alerts, isNull, desc } from '@backupos/db'
import { EmptyState } from '@/components/ui/empty-state'
import { snoozeAlert } from '@/app/actions/alerts'

const SNOOZE_OPTIONS = [
  { label: '1h',  hours: 1  },
  { label: '4h',  hours: 4  },
  { label: '24h', hours: 24 },
]

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--err)',
  warning:  'var(--warn)',
  info:     'var(--ok)',
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function isSnoozed(until: Date | null | undefined): boolean {
  if (!until) return false
  return until.getTime() > Date.now()
}

export default async function AlertsPage() {
  const db       = getDb()
  const topLevel = await db
    .select()
    .from(alerts)
    .where(isNull(alerts.parentId))
    .orderBy(desc(alerts.firedAt))
    .limit(100)
    .all()

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 20px', fontSize: 13, color: 'var(--fg)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alerts</h1>

      {topLevel.length === 0 ? (
        <EmptyState
          type="page"
          headline="All quiet. No open alerts."
          description="Backup failures, missed schedules, and agent disconnections will appear here."
        />
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Severity</th>
                <th style={th}>Message</th>
                <th style={th}>Fired</th>
                <th style={th}>Snooze</th>
              </tr>
            </thead>
            <tbody>
              {topLevel.map(alert => {
                const snoozed = isSnoozed(alert.snoozedUntil)
                return (
                  <tr key={alert.id} style={{ opacity: snoozed ? 0.5 : 1 }}>
                    <td style={td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 600,
                        color: SEVERITY_COLOR[alert.severity ?? 'info'] ?? 'var(--fg-mute)',
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: SEVERITY_COLOR[alert.severity ?? 'info'] ?? 'var(--fg-dim)',
                          display: 'inline-block',
                        }} />
                        {(alert.severity ?? 'info').toUpperCase()}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{alert.message}</div>
                      {(alert.childCount ?? 0) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                          +{alert.childCount} related
                        </div>
                      )}
                      {snoozed && (
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                          Snoozed until {fmtDate(alert.snoozedUntil)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                      {fmtDate(alert.firedAt)}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {SNOOZE_OPTIONS.map(opt => {
                          const action = snoozeAlert.bind(null, alert.id, opt.hours)
                          return (
                            <form key={opt.label} action={action}>
                              <button
                                type="submit"
                                style={{
                                  padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                                  background: 'var(--surf2)', color: 'var(--fg-mute)',
                                }}
                              >
                                {opt.label}
                              </button>
                            </form>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
