import Link from 'next/link'
import { nav } from '@backupos/docs-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'BackupOS Docs' }

export default function HomePage() {
  return (
    <div>
      <h1>BackupOS Documentation</h1>
      <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 32 }}>
        Unified backup management for homelabs and small businesses.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {nav.sections.map(section => (
          <Link
            key={section.slug}
            href={`/${section.slug}/${section.pages[0].slug}`}
            style={{
              display: 'block', padding: '16px 20px',
              border: '1px solid #e5e7eb', borderRadius: 8,
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{section.title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {section.pages.length} {section.pages.length === 1 ? 'page' : 'pages'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
