'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createIntegrationToken,
  revokeIntegrationToken,
  rotateIntegrationToken,
} from '@/app/actions/integration-tokens'

// Scope constants duplicated here to avoid importing the server-only lib
const ALL_SCOPES = [
  'instance:read',
  'services:read',
  'jobs:read',
  'runs:read',
  'agents:read',
  'repositories:read',
  'monitors:read',
  'health:read',
] as const

const SCOPE_LABELS: Record<string, string> = {
  'instance:read':     'Instance metadata',
  'services:read':     'Coverage services',
  'jobs:read':         'Backup jobs',
  'runs:read':         'Backup run history',
  'agents:read':       'Agents',
  'repositories:read': 'Repositories (no secrets)',
  'monitors:read':     'Monitors',
  'health:read':       'Health rollup',
}

export interface IntegrationTokenRow {
  id: string
  name: string
  tokenPrefix: string
  scopes: string       // JSON
  expiresAt: Date | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
  rateLimitRpm: number
}

function statusBadge(token: IntegrationTokenRow): { label: string; color: string } {
  const now = Date.now()
  if (token.revokedAt) {
    const elapsed = now - token.revokedAt.getTime()
    const gracePeriodMs = 24 * 60 * 60 * 1000
    if (elapsed < gracePeriodMs) return { label: 'Grace period', color: 'var(--color-warning)' }
    return { label: 'Revoked', color: 'var(--color-error)' }
  }
  if (token.expiresAt && token.expiresAt.getTime() < now) return { label: 'Expired', color: 'var(--color-error)' }
  if (token.expiresAt) {
    const daysLeft = Math.ceil((token.expiresAt.getTime() - now) / 86400000)
    if (daysLeft <= 7) return { label: `Expires in ${daysLeft}d`, color: 'var(--color-warning)' }
  }
  return { label: 'Active', color: 'var(--color-success)' }
}

function TokenRevealBanner({ token, variant }: { token: string; variant: 'created' | 'rotated' }) {
  const [copied, setCopied] = useState(false)
  const bg = variant === 'created' ? 'var(--color-success-muted)' : 'var(--color-info-muted)'

  function copy() {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ background: bg, border: '1px solid currentColor', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>
        {variant === 'created' ? 'Token created — copy it now' : 'Token rotated — update your connector'}
      </p>
      <p style={{ fontSize: 12, marginBottom: 8, opacity: 0.75 }}>
        This token will only be shown once. Store it securely before leaving this page.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.1)', borderRadius: 4, fontSize: 13, wordBreak: 'break-all' }}>
          {token}
        </code>
        <button onClick={copy} className="btn btn-sm btn-outline">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function CreateTokenForm({ onCreated }: { onCreated: (token: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createIntegrationToken(fd)
      if (result.error) { setError(result.error); return }
      if (result.token) { onCreated(result.token) }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Name</label>
        <input name="name" required placeholder="e.g. InfraOS — homelab" className="input input-sm" style={{ width: '100%' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Scopes</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
          {ALL_SCOPES.map(scope => (
            <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" name="scopes" value={scope} defaultChecked />
              {SCOPE_LABELS[scope]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Expires in</label>
        <select name="expiresInDays" defaultValue="90" className="input input-sm">
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="0">Never</option>
        </select>
      </div>

      {error && <p style={{ color: 'var(--color-error)', fontSize: 13 }}>{error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
        {pending ? 'Creating…' : 'Create token'}
      </button>
    </form>
  )
}

export function IntegrationTokenSection({ initial }: { initial: IntegrationTokenRow[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [rotatedToken, setRotatedToken] = useState<string | null>(null)
  const [actionPending, startAction] = useTransition()

  function handleCreated(raw: string) {
    setNewToken(raw)
    setShowForm(false)
    router.refresh()
  }

  function handleRevoke(id: string) {
    startAction(async () => {
      await revokeIntegrationToken(id)
      router.refresh()
    })
  }

  function handleRotate(id: string) {
    startAction(async () => {
      const result = await rotateIntegrationToken(id)
      if (result.token) setRotatedToken(result.token)
      router.refresh()
    })
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Integration tokens</h2>
          <p style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>
            Scoped read-only tokens for external consumers such as InfraOS.
          </p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New token'}
        </button>
      </div>

      {newToken && (
        <TokenRevealBanner token={newToken} variant="created" />
      )}
      {rotatedToken && (
        <TokenRevealBanner token={rotatedToken} variant="rotated" />
      )}

      {showForm && (
        <div style={{ background: 'var(--color-surface-raised)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <CreateTokenForm onCreated={handleCreated} />
        </div>
      )}

      {initial.length === 0 && !showForm ? (
        <p style={{ fontSize: 13, opacity: 0.5 }}>No integration tokens yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {initial.map(token => {
            const { label, color } = statusBadge(token)
            const scopes: string[] = (() => { try { return JSON.parse(token.scopes) } catch { return [] } })()
            const isActive = !token.revokedAt && !(token.expiresAt && token.expiresAt.getTime() < Date.now())

            return (
              <div key={token.id} style={{
                background: 'var(--color-surface-raised)',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{token.name}</span>
                    <code style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>{token.tokenPrefix}…</code>
                    <span style={{ marginLeft: 10, fontSize: 12, color, fontWeight: 500 }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isActive && (
                      <button
                        className="btn btn-xs btn-outline"
                        disabled={actionPending}
                        onClick={() => handleRotate(token.id)}
                      >
                        Rotate
                      </button>
                    )}
                    {isActive && (
                      <button
                        className="btn btn-xs btn-danger-outline"
                        disabled={actionPending}
                        onClick={() => handleRevoke(token.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.55, display: 'flex', gap: 16 }}>
                  <span>Created {token.createdAt.toLocaleDateString()}</span>
                  {token.lastUsedAt && <span>Last used {token.lastUsedAt.toLocaleDateString()}</span>}
                  {token.expiresAt && <span>Expires {token.expiresAt.toLocaleDateString()}</span>}
                  <span>{token.rateLimitRpm} rpm</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {scopes.map(s => (
                    <span key={s} style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      background: 'var(--color-surface)',
                      borderRadius: 4,
                      fontFamily: 'monospace',
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
