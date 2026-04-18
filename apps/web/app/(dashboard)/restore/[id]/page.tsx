import type { ComponentProps } from 'react'
import { getDb, restoreSpecs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function validationBadge(s: string | null): BadgeStatus {
  if (s === 'valid')   return 'healthy'
  if (s === 'invalid') return 'error'
  return 'idle'
}

export default async function RestoreSpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)
  if (!spec) notFound()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/restore" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Restore</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{spec.name}</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/restore/${id}/runs`} style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="md">Run history</Button>
            </Link>
            <Button variant="primary" size="md">Run now</Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <Badge status={validationBadge(spec.validationStatus)} label={spec.validationStatus ?? 'untested'} />
        {spec.description && <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>{spec.description}</span>}
      </div>

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 20,
      }}>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          YAML
        </div>
        <pre style={{
          margin: 0, fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {spec.yamlContent}
        </pre>
      </div>
    </div>
  )
}
