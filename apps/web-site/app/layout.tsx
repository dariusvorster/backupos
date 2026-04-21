import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BackupOS — Restic backup management',
  description: 'Automated, encrypted, deduplicated backups powered by Restic. One dashboard for all your repositories.',
  openGraph: {
    title: 'BackupOS',
    description: 'Automated Restic backup management',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
