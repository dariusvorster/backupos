import type { ComponentProps } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { getDb, verificationTests, backupJobs, eq } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function resultBadge(r: string | null): BadgeStatus {
  if (r === 'passed') return 'success'
  if (r === 'failed') return 'error'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function VerificationPage() {
  const db = getDb()
  const tests = await db
    .select({
      id:         verificationTests.id,
      name:       verificationTests.name,
      jobId:      verificationTests.jobId,
      jobName:    backupJobs.name,
      targetType: verificationTests.targetType,
      schedule:   verificationTests.schedule,
      lastResult: verificationTests.lastResult,
      lastRunAt:  verificationTests.lastRunAt,
      nextRunAt:  verificationTests.nextRunAt,
      enabled:    verificationTests.enabled,
    })
    .from(verificationTests)
    .leftJoin(backupJobs, eq(verificationTests.jobId, backupJobs.id))
    .all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Verification</h1>
        <Link href="/verification/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md">
            <ShieldCheck size={14} />
            New test
          </Button>
        </Link>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {tests.length === 0 ? (
          <EmptyState
            type="page"
            headline="No verification tests yet"
            description="Set up a scheduled restore test to prove your backups actually work."
            primaryAction={{ label: 'New test', href: '/verification/new' }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Job</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Target</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Schedule</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last result</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Next run</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/verification/${t.id}`} style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, textDecoration: 'none' }}>
                      {t.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {t.jobName ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {t.targetType?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {t.schedule ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={resultBadge(t.lastResult)} label={t.lastResult ?? 'never run'} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(t.nextRunAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
