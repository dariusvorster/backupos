export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Settings</h1>

      {[
        { title: 'General', items: ['Instance name', 'Time zone', 'Language'] },
        { title: 'Notifications', items: ['Email SMTP', 'Webhook URL', 'Slack integration'] },
        { title: 'Security', items: ['Change password', 'API tokens', 'Session management'] },
        { title: 'Backup defaults', items: ['Retention policy', 'Bandwidth limits', 'Schedule windows'] },
      ].map(section => (
        <div key={section.title} style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', marginBottom: 16,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            {section.title}
          </div>
          {section.items.map(item => (
            <div key={item} style={{
              padding: '14px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13, color: 'var(--fg)',
            }}>
              {item}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="var(--fg-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
