import Link from 'next/link'
import { getDb, repositories, isNotNull } from '@backupos/db'
import { EscrowRecoverySection } from '@/components/escrow-recovery-section'
import { Key } from 'lucide-react'

const LINKED_ITEMS: Record<string, string> = {
  'General':            '/settings/general',
  'Email SMTP':         '/settings/smtp',
  'Webhook URL':        '/settings/webhook',
  'Slack integration':  '/settings/slack',
  'Alert channels':     '/settings/alerts',
  'Change password':    '/settings/security',
  'API tokens':         '/settings/api-tokens',
  'Session management': '/settings/sessions',
  'Retention policy':   '/settings/retention',
  'Schedule windows':   '/settings/schedule-windows',
  'Bandwidth limits':   '/settings/bandwidth',
  'Infra OS services':  '/settings/infra-os',
  'Logging':            '/settings/logging',
  'Profile':            '/settings/profile',
}

const chevron = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4l4 4-4 4" stroke="var(--fg-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const itemStyle: React.CSSProperties = {
  padding: '14px 20px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontSize: 13, color: 'var(--fg)',
}

export default async function SettingsPage() {
  const db = getDb()
  const escrowedRepos = await db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .where(isNotNull(repositories.escrowedKey))
    .all()

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Settings</h1>

      {[
        { title: 'General', items: ['General'] },
        { title: 'Notifications', items: ['Email SMTP', 'Webhook URL', 'Slack integration', 'Alert channels'] },
        { title: 'Security', items: ['Change password', 'API tokens', 'Session management'] },
        { title: 'Backup defaults', items: ['Retention policy', 'Bandwidth limits', 'Schedule windows', 'Infra OS services'] },
        { title: 'Logging', items: ['Logging'] },
      ].map(section => (
        <div key={section.title} style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 16,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            {section.title}
          </div>
          {section.items.map(item => {
            const href = LINKED_ITEMS[item]
            if (href) {
              return (
                <Link key={item} href={href} style={{ ...itemStyle, textDecoration: 'none', cursor: 'pointer' }}>
                  {item}
                  {chevron}
                </Link>
              )
            }
            return (
              <div key={item} style={{ ...itemStyle, opacity: 0.4, cursor: 'not-allowed' }}>
                {item}
                <span style={{ fontSize: 10, color: 'var(--fg-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  soon
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {/* Password recovery */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Key size={16} color="var(--fg-mute)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Recover repository password</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.5 }}>
          If you have forgotten a repository password, you can recover it here using your recovery passphrase — provided escrow was enabled for that repository.
        </p>
        <EscrowRecoverySection repos={escrowedRepos} />
      </div>
    </div>
  )
}
