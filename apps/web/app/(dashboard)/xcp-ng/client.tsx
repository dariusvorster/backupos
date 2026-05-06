'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addXcpPool, refreshXcpPool, deleteXcpPool } from '@/app/actions/xcp-pools'

// ── Shared style tokens ───────────────────────────────────────────────────────

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 24,
  backgroundColor: 'var(--surf)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--fg-dim)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--bg)',
  color: 'var(--fg)',
  boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  backgroundColor: 'var(--accent)',
  color: '#fff',
  cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--fg-dim)',
  cursor: 'pointer',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 12,
  color: 'var(--fg-dim)',
  fontWeight: 500,
  borderBottom: '1px solid var(--border)',
}

const td: React.CSSProperties = {
  padding: '10px',
  color: 'var(--fg)',
  borderBottom: '1px solid var(--border)',
}

// ── Connect form ──────────────────────────────────────────────────────────────

/** Standalone connect form that redirects to /xcp-ng/pools on success. */
export function ConnectFormPage() {
  const router = useRouter()
  return (
    <ConnectForm onSuccess={() => router.push('/xcp-ng/pools')} />
  )
}

interface ConnectFormProps {
  onSuccess?: () => void
}

export function ConnectForm({ onSuccess }: ConnectFormProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name           = fd.get('name') as string
    const poolMasterUrl  = fd.get('poolMasterUrl') as string
    const username       = fd.get('username') as string
    const password       = fd.get('password') as string
    const verifySsl      = fd.get('verifySsl') === 'on'
    const certFingerprint = (fd.get('certFingerprint') as string) || undefined

    setError(null)
    startTransition(async () => {
      const result = await addXcpPool({ name, poolMasterUrl, username, password, verifySsl, certFingerprint })
      if (!result.ok) {
        setError(result.error)
      } else {
        onSuccess?.()
      }
    })
  }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Connect XCP-ng Pool</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input name="name" required style={inputStyle} placeholder="My XCP-ng Pool" />
        </div>
        <div>
          <label style={labelStyle}>Pool Master URL</label>
          <input name="poolMasterUrl" required style={inputStyle} placeholder="https://xcp-master.local" />
        </div>
        <div>
          <label style={labelStyle}>Username</label>
          <input name="username" required style={inputStyle} placeholder="root" />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input name="password" type="password" required style={inputStyle} />
        </div>
        <div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input name="verifySsl" type="checkbox" defaultChecked />
            Verify SSL certificate
          </label>
        </div>
        <div>
          <label style={labelStyle}>Certificate fingerprint (optional)</label>
          <input name="certFingerprint" style={inputStyle} placeholder="SHA256:..." />
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--red, #e53e3e)', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}
        <div>
          <button type="submit" disabled={pending} style={btnPrimary}>
            {pending ? 'Connecting…' : 'Connect & save'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Pool list ─────────────────────────────────────────────────────────────────

export interface PoolRow {
  id: string
  name: string
  poolMasterUrl: string
  lastTestStatus: string | null
  lastSeenAt: string | null
}

export function PoolList({ initialPools }: { initialPools: PoolRow[] }) {
  const [pools, setPools] = useState(initialPools)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  function handleRefresh(poolId: string) {
    setBusyId(poolId)
    startTransition(async () => {
      await refreshXcpPool(poolId)
      setBusyId(null)
      // Reload to get updated pool rows — server component will re-render on next nav
      window.location.reload()
    })
  }

  function handleDelete(poolId: string) {
    if (!confirm('Delete this pool? All associated VMs will also be removed.')) return
    startTransition(async () => {
      await deleteXcpPool(poolId)
      setPools(p => p.filter(r => r.id !== poolId))
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>URL</th>
            <th style={th}>Status</th>
            <th style={th}>Last seen</th>
            <th style={th}>VMs</th>
            <th style={{ ...th, width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {pools.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--fg-dim)', padding: 32 }}>
                No pools yet — <a href="/xcp-ng/connect" style={{ color: 'var(--accent)' }}>connect one</a>
              </td>
            </tr>
          ) : (
            pools.map(p => (
              <tr key={p.id}>
                <td style={td}>{p.name}</td>
                <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}><code>{p.poolMasterUrl}</code></td>
                <td style={td}>
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    backgroundColor: p.lastTestStatus === 'ok' ? 'var(--green-dim, #c6f6d5)' : p.lastTestStatus === 'error' ? 'var(--red-dim, #fed7d7)' : 'var(--border)',
                    color: p.lastTestStatus === 'ok' ? 'var(--green-deep, #276749)' : p.lastTestStatus === 'error' ? 'var(--red-deep, #9b2c2c)' : 'var(--fg-dim)',
                  }}>
                    {p.lastTestStatus ?? 'unknown'}
                  </span>
                </td>
                <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>
                  {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleString() : '—'}
                </td>
                <td style={td}>
                  <a href={`/xcp-ng/vms?pool=${p.id}`} style={{ color: 'var(--accent)', fontSize: 12 }}>View VMs</a>
                </td>
                <td style={{ ...td, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleRefresh(p.id)}
                    disabled={pending && busyId === p.id}
                    style={btnDanger}
                  >
                    {pending && busyId === p.id ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={pending} style={{ ...btnDanger, color: 'var(--red, #e53e3e)' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── VM list ───────────────────────────────────────────────────────────────────

export interface VmRow {
  uuid: string
  nameLabel: string
  poolName: string
  powerState: string
  isCbtCapable: boolean
  lastSeenAt: string | null
}

export function VmList({ vms }: { vms: VmRow[] }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Pool</th>
            <th style={th}>Power state</th>
            <th style={th}>CBT</th>
            <th style={th}>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {vms.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--fg-dim)', padding: 32 }}>
                No VMs found — refresh a pool to populate
              </td>
            </tr>
          ) : (
            vms.map(v => (
              <tr key={v.uuid}>
                <td style={td}>{v.nameLabel}</td>
                <td style={{ ...td, color: 'var(--fg-dim)' }}>{v.poolName}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    backgroundColor: v.powerState === 'Running' ? 'var(--green-dim, #c6f6d5)' : 'var(--border)',
                    color: v.powerState === 'Running' ? 'var(--green-deep, #276749)' : 'var(--fg-dim)',
                  }}>
                    {v.powerState}
                  </span>
                </td>
                <td style={td}>
                  {v.isCbtCapable ? (
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--accent-dim)', color: 'var(--accent-deep)' }}>CBT</span>
                  ) : (
                    <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>
                  {v.lastSeenAt ? new Date(v.lastSeenAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
