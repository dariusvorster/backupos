import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, backupMonitors, eq } from '@backupos/db'
import { promoteMonitorToRepo } from '@/app/actions/monitors'
import type { PBSConfig } from '@backupos/monitors'

const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', boxSizing: 'border-box',
}

export default async function PromotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, id)).limit(1)
  if (!monitor || monitor.type !== 'proxmox_pbs') notFound()

  const cfg = JSON.parse(monitor.config) as PBSConfig

  async function handlePromote(fd: FormData) {
    'use server'
    await promoteMonitorToRepo(id, fd)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/monitors/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {monitor.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>
          Promote to managed repository
        </h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          This will create a Restic repository backed by the <strong>{cfg.datastore}</strong> datastore
          on <strong>{cfg.url}</strong>. BackupOS will use the PBS API token for authentication.
        </p>
      </div>

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24,
      }}>
        {/* Read-only summary of the PBS connection */}
        <div style={{
          background: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 24,
          fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-mute)',
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px',
        }}>
          <span style={{ color: 'var(--fg-dim)' }}>URL</span>
          <span>{cfg.url}</span>
          <span style={{ color: 'var(--fg-dim)' }}>Datastore</span>
          <span>{cfg.datastore}</span>
          <span style={{ color: 'var(--fg-dim)' }}>Token</span>
          <span>{cfg.tokenId}</span>
          <span style={{ color: 'var(--fg-dim)' }}>Restic URL</span>
          <span style={{ wordBreak: 'break-all' }}>rest:{cfg.url}/{cfg.datastore}/</span>
        </div>

        <form action={handlePromote} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
              Repository encryption password
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={1}
              placeholder="Choose a strong password"
              autoFocus
              style={input}
            />
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              Restic encrypts all data client-side before sending it to PBS. This password is separate
              from your PBS credentials — store it safely, you will need it to restore.
            </span>
          </label>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link
              href={`/monitors/${id}`}
              style={{
                padding: '7px 16px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', color: 'var(--fg)',
                textDecoration: 'none', background: 'var(--surf2)',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              style={{
                padding: '7px 20px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
              }}
            >
              Promote →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
