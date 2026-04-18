import { getDb, restoreSpecs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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
            <Link href={`/restore/${id}/runs`} style={{
              padding: '8px 14px', backgroundColor: 'var(--surf2)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
            }}>
              Run history
            </Link>
            <button style={{
              padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Run now
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
          backgroundColor: spec.validationStatus === 'valid' ? 'var(--ok-dim)' : spec.validationStatus === 'invalid' ? 'var(--err-dim)' : 'var(--surf2)',
          color: spec.validationStatus === 'valid' ? 'var(--ok)' : spec.validationStatus === 'invalid' ? 'var(--err)' : 'var(--fg-mute)',
        }}>
          {spec.validationStatus ?? 'untested'}
        </span>
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
