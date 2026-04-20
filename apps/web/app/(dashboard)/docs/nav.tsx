'use client'

import type { Nav } from '@backupos/docs-content'

export function DocsNav({ nav: _nav }: { nav: Nav }) {
  return (
    <aside style={{
      width: 220,
      minWidth: 220,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
      padding: '16px 0',
    }} />
  )
}
