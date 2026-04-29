import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDb, alertChannels, eq } from '@backupos/db'
import { INTEGRATIONS_REGISTRY } from '@/lib/integrations'
import { createAlertChannelForType, deleteAlertChannelForType } from '@/app/actions/alerts'
import { IntegrationAddForm } from './IntegrationAddForm'
import { SendTestButton } from './SendTestButton'

export default async function IntegrationDetailPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const integ = INTEGRATIONS_REGISTRY.find(i => i.type === type)
  if (!integ) notFound()

  const db       = getDb()
  const channels = await db.select().from(alertChannels).where(eq(alertChannels.type, type)).all()

  const addAction    = createAlertChannelForType.bind(null, integ.type)

  return (
    <div style={{ maxWidth: 580 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 24, fontSize: 13, color: 'var(--fg-dim)' }}>
        <a href="/settings" style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>Settings</a>
        <span>›</span>
        <a href="/settings/integrations" style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>Integrations</a>
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>{integ.name}</span>
      </div>

      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>{integ.name}</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 28, lineHeight: 1.5 }}>
        {integ.description}
      </p>

      {/* Setup guide */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 14 }}>Setup guide</div>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {integ.setupSteps.map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.55 }}>
              {step}
            </li>
          ))}
        </ol>
        <a
          href={integ.externalDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 14, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
        >
          {integ.name} documentation ↗
        </a>
      </div>

      {/* Sample alert preview */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 14 }}>Sample alert preview</div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 12 }}>
          This is how a <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', backgroundColor: 'var(--surf2)', padding: '1px 5px', borderRadius: 3 }}>backup_failed</code> alert appears in {integ.name}.
        </p>
        <div style={{
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px',
          fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>{integ.samplePayload.title}</div>
          <div style={{ color: 'var(--fg-mute)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {integ.samplePayload.body}
          </div>
          {integ.samplePayload.footer && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-dim)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              {integ.samplePayload.footer}
            </div>
          )}
        </div>
      </div>

      {/* Connected channels */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', marginBottom: 20,
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
          Connected channels ({channels.length})
        </div>

        {channels.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
            No {integ.name} channels configured yet.
          </div>
        ) : (
          channels.map(ch => {
            const deleteAction = deleteAlertChannelForType.bind(null, ch.id, integ.type)
            let subtitle = ''
            try {
              const cfg = JSON.parse(ch.config) as Record<string, string>
              if (cfg.url)            subtitle = cfg.url.slice(0, 50) + (cfg.url.length > 50 ? '…' : '')
              else if (cfg.chatId)    subtitle = `chat ${cfg.chatId}`
              else if (cfg.stream)    subtitle = `stream: ${cfg.stream}`
              else if (cfg.userKey)   subtitle = `user ${cfg.userKey.slice(0, 16)}…`
              else if (cfg.integrationKey) subtitle = cfg.integrationKey.slice(0, 12) + '…'
            } catch { /* ignore */ }

            return (
              <div key={ch.id} style={{
                padding: '14px 20px', borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{ch.name}</div>
                  {subtitle && (
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {subtitle}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <SendTestButton channelId={ch.id} />
                  </div>
                </div>
                <form action={deleteAction} style={{ flexShrink: 0 }}>
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
          })
        )}
      </div>

      {/* Add channel */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px 24px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>
          Add {integ.name} channel
        </div>
        <IntegrationAddForm configFields={integ.configFields} addAction={addAction} />
      </div>
    </div>
  )
}
