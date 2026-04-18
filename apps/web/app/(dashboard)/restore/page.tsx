import type { ComponentProps } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { getDb, restoreSpecs, restoreRuns, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function validationBadge(s: string | null): BadgeStatus {
  if (s === 'valid')   return 'healthy'
  if (s === 'invalid') return 'error'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function RestorePage() {
  const db = getDb()
  const [specs, recentRuns] = await Promise.all([
    db.select().from(restoreSpecs).all(),
    db.select().from(restoreRuns).orderBy(desc(restoreRuns.startedAt)).limit(10).all(),
  ])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Restore</h1>
        <Link href="/restore/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md">
            <RotateCcw size={14} />
            New restore spec
          </Button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Specs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Restore specs
          </div>
          {specs.length === 0 ? (
            <EmptyState
              type="inline"
              headline="No restore specs yet."
              primaryAction={{ label: 'Create one', href: '/restore/new' }}
            />
          ) : (
            specs.map(spec => (
              <div key={spec.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Link href={`/restore/${spec.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                    {spec.name}
                  </Link>
                </div>
                <Badge
                  status={validationBadge(spec.validationStatus)}
                  label={spec.validationStatus ?? 'Untested'}
                />
              </div>
            ))
          )}
        </div>

        {/* Recent runs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Recent restore runs
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState
              type="inline"
              headline="No restore runs yet"
            />
          ) : (
            recentRuns.map(run => (
              <div key={run.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(run.startedAt)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{run.trigger ?? 'manual'}</div>
                </div>
                <Badge status={run.status as BadgeStatus} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
