import { getDb, alertChannels } from '@backupos/db'
import { createAlertChannel, deleteAlertChannel } from '@/app/actions/alerts'

const TYPE_LABELS: Record<string, string> = {
  discord: 'Discord',
  slack:   'Slack',
  webhook: 'Webhook',
}

export default async function AlertChannelsPage() {
  const db       = getDb()
  const channels = await db.select().from(alertChannels).all()

  return (
    <div style={{ maxWidth: 560 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alert channels</h1>

      {channels.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 24,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Configured channels
          </div>
          {channels.map(ch => {
            const deleteAction = deleteAlertChannel.bind(null, ch.id)
            let url = ''
            try { url = (JSON.parse(ch.config) as { url: string }).url } catch { /* ignore */ }
            return (
              <div key={ch.id} style={{
                padding: '14px 20px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {TYPE_LABELS[ch.type] ?? ch.type} · {url.slice(0, 40)}{url.length > 40 ? '…' : ''}
                  </div>
                </div>
                <form action={deleteAction}>
                  <button
                    type="submit"
                    style={{
                      padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--surf2)', color: 'var(--err)',
                    }}
                  >
                    Remove
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 16 }}>Add channel</div>
        <form action={createAlertChannel} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Ops Discord"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Type</label>
            <select
              name="type"
              required
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13,
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            >
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="webhook">Generic webhook</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Webhook URL</label>
            <input
              name="url"
              type="url"
              required
              placeholder="https://discord.com/api/webhooks/…"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              alignSelf: 'flex-start', padding: '7px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff', cursor: 'pointer',
            }}
          >
            Add channel
          </button>
        </form>
      </div>
    </div>
  )
}
