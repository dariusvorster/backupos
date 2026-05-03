import { getDb, alertChannels } from '@backupos/db'
import { deleteAlertChannel, saveChannelSubscriptions } from '@/app/actions/alerts'
import { ALL_ALERT_TYPES, ALERT_TYPE_LABELS } from '@/lib/alerts'
import { AddChannelForm } from './AddChannelForm'
import { TestChannelButton } from './TestChannelButton'

const TYPE_LABELS: Record<string, string> = {
  discord:   'Discord',
  slack:     'Slack',
  webhook:   'Webhook',
  zulip:     'Zulip',
  telegram:  'Telegram',
  pagerduty: 'PagerDuty',
  ntfy:      'ntfy',
  gotify:    'Gotify',
  pushover:  'Pushover',
}

export default async function AlertChannelsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const db       = getDb()
  const channels = await db.select().from(alertChannels).all()
  const { saved } = await searchParams

  return (
    <div style={{ maxWidth: 560 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alert channels</h1>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Channel saved.
        </div>
      )}

      {channels.length > 0 && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 24,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Configured channels
          </div>
          {channels.map(ch => {
            const deleteAction      = deleteAlertChannel.bind(null, ch.id)
            const subscribeAction   = saveChannelSubscriptions.bind(null, ch.id)
            let subtitle = ''
            try {
              const cfg = JSON.parse(ch.config) as Record<string, string>
              if (cfg.url)                  { subtitle = cfg.url.slice(0, 48) + (cfg.url.length > 48 ? '…' : '') }
              else if (cfg.chatId)          { subtitle = `chat ${cfg.chatId}` }
              else if (cfg.integrationKey)  { subtitle = cfg.integrationKey.slice(0, 20) + '…' }
              else if (cfg.userKey)         { subtitle = `user ${cfg.userKey.slice(0, 16)}…` }
            } catch { /* ignore */ }

            // null = subscribe to all (back-compat); explicit array = explicit selection
            let subscribedSet: Set<string> | null = null
            if (ch.subscribedEvents) {
              try {
                subscribedSet = new Set(JSON.parse(ch.subscribedEvents) as string[])
              } catch { /* treat as all */ }
            }
            const isChecked = (t: string) => subscribedSet === null || subscribedSet.has(t)

            return (
              <div key={ch.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{
                  padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{ch.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {TYPE_LABELS[ch.type] ?? ch.type}{subtitle ? ` · ${subtitle}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TestChannelButton channelId={ch.id} />
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
                </div>

                {/* Per-channel event subscriptions */}
                <form action={subscribeAction} style={{ padding: '0 20px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Notify on
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 10 }}>
                    {ALL_ALERT_TYPES.map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          name={`event_${t}`}
                          defaultChecked={isChecked(t)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        {ALERT_TYPE_LABELS[t]}
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    style={{
                      padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                      background: 'var(--surf2)', color: 'var(--fg)',
                    }}
                  >
                    Save
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
        <AddChannelForm />
      </div>
    </div>
  )
}
