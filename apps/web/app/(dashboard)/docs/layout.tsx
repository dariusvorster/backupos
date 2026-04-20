import { nav }    from '@backupos/docs-content'
import { DocsNav } from './nav'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <DocsNav nav={nav} />
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
