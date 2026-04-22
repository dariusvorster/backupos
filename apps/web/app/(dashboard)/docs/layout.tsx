import { nav }     from '@backupos/docs-content'
import { DocsNav }  from './nav'
import { IconDocs } from './icons'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    // Break out of DashboardLayout's main padding (24px) and own the scroll
    <div style={{
      display: 'flex', flexDirection: 'column',
      margin: '-24px',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden',
    }}>
      {/* Docs top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surf)',
        flexShrink: 0,
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--accent)',
          color: '#000',
        }}>
          <IconDocs size={16} />
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.2 }}>Documentation</div>
          <div style={{ fontSize: 11, color: 'var(--fg-mute)', lineHeight: 1.2 }}>BackupOS knowledge base</div>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DocsNav nav={nav} />
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '40px 56px',
          minWidth: 0,
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}
