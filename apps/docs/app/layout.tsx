import './globals.css'
import type { Metadata } from 'next'
import { nav } from '@backupos/docs-content'
import { DocsNav } from '../components/docs-nav'

export const metadata: Metadata = {
  title: { default: 'BackupOS Docs', template: '%s | BackupOS Docs' },
  description: 'Documentation for BackupOS — unified backup management.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <DocsNav nav={nav} />
          <main style={{ flex: 1, padding: '48px 56px', maxWidth: 800, minWidth: 0 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
