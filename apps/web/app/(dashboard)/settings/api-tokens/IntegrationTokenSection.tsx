'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
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

type BadgeVariant = 'ok' | 'warn' | 'err'

function statusBadge(token: IntegrationTokenRow): { label: string; variant: BadgeVariant } {
  const now = Date.now()
  if (token.revokedAt) {
    const elapsed = now - token.revokedAt.getTime()
    const gracePeriodMs = 24 * 60 * 60 * 1000
    if (elapsed < gracePeriodMs) return { label: 'Grace period', variant: 'warn' }
    return { label: 'Revoked', variant: 'err' }
  }
  if (token.expiresAt && token.expiresAt.getTime() < now) return { label: 'Expired', variant: 'err' }
  if (token.expiresAt) {
    const daysLeft = Math.ceil((token.expiresAt.getTime() - now) / 86400000)
    if (daysLeft <= 7) return { label: `Expires in ${daysLeft}d`, variant: 'warn' }
  }
  return { label: 'Active', variant: 'ok' }
}

function badgePillStyle(variant: BadgeVariant): React.CSSProperties {
  const v = variant === 'ok' ? 'var(--ok)' : variant === 'warn' ? 'var(--warn)' : 'var(--err)'
  return {
    display: 'inline-block',
    fontSize: 11, fontWeight: 500,
    padding: '2px 7px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: `color-mix(in srgb, ${v} 15%, transparent)`,
    color: v,
    border: `1px solid color-mix(in srgb, ${v} 30%, transparent)`,
  }
}

function TokenRevealBanner({ token, variant }: { token: string; variant: 'created' | 'rotated' }) {
  const [copied, setCopied] = useState(false)
  const isCreated = variant === 'created'
  const accentVar = isCreated ? 'var(--ok)' : 'var(--warn)'

  function copy() {
    copyToClipboard(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      backgroundColor: `color-mix(in srgb, ${accentVar} 12%, var(--surf))`,
      border: `1px solid color-mix(in srgb, ${accentVar} 30%, transparent)`,
      borderRadius: 'var(--radius-sm)',
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: accentVar, marginBottom: 4 }}>
        {isCreated ? "Token created — copy it now, it won't be shown again" : 'Token rotated — update your InfraOS connector'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 10 }}>
        This token will only be shown once. Store it securely before leaving this page.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--fg)', wordBreak: 'break-all',
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 10px',
        }}>
          {token}
        </div>
        <button
          onClick={copy}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            backgroundColor: 'var(--surf2)', color: 'var(--fg)', whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
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
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>
          Token name
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="e.g. InfraOS — homelab"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 8 }}>
          Scopes
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {ALL_SCOPES.map(scope => (
            <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg)', cursor: 'pointer' }}>
              <input type="checkbox" name="scopes" value={scope} defaultChecked />
              {SCOPE_LABELS[scope]}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>
          Expires in
        </label>
        <select name="expiresInDays" defaultValue="90" style={{ ...inputStyle, width: 'auto' }}>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="0">Never</option>
        </select>
      </div>

      {error && <div style={{ fontSize: 13, color: 'var(--err)', marginBottom: 12 }}>{error}</div>}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
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
    <div style={{ maxWidth: 580 }}>
      {newToken      && <TokenRevealBanner token={newToken}      variant="created" />}
      {rotatedToken  && <TokenRevealBanner token={rotatedToken}  variant="rotated" />}

      {showForm && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>New integration token</div>
            <button
              onClick={() => setShowForm(false)}
              style={{ fontSize: 12, color: 'var(--fg-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Cancel
            </button>
          </div>
          <CreateTokenForm onCreated={handleCreated} />
        </div>
      )}

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              Integration tokens ({initial.length})
            </span>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
              Scoped read-only tokens for external consumers such as InfraOS.
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                backgroundColor: 'var(--surf2)', color: 'var(--fg)', whiteSpace: 'nowrap',
              }}
            >
              + New token
            </button>
          )}
        </div>

        {initial.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            No integration tokens yet.
          </div>
        ) : initial.map((token, i) => {
          const { label, variant } = statusBadge(token)
          const scopes: string[] = (() => { try { return JSON.parse(token.scopes) } catch { return [] } })()
          const isActive = !token.revokedAt && !(token.expiresAt && token.expiresAt.getTime() < Date.now())

          return (
            <div
              key={token.id}
              style={{
                padding: '14px 20px',
                borderTop: i === 0 ? undefined : '1px solid var(--border2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{token.name}</span>
                    <span style={badgePillStyle(variant)}>{label}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)', marginBottom: 6 }}>
                    {token.tokenPrefix}… · Created {token.createdAt.toLocaleDateString()}
                    {token.lastUsedAt ? ` · Last used ${token.lastUsedAt.toLocaleDateString()}` : ' · Never used'}
                    {token.expiresAt ? ` · Expires ${token.expiresAt.toLocaleDateString()}` : ''}
                    {` · ${token.rateLimitRpm} rpm`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {scopes.map(s => (
                      <span
                        key={s}
                        style={{
                          fontSize: 11, padding: '2px 8px',
                          backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)',
                          color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                {isActive && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleRotate(token.id)}
                      disabled={actionPending}
                      style={{
                        padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                        backgroundColor: 'var(--surf2)', color: 'var(--fg)',
                      }}
                    >
                      Rotate
                    </button>
                    <button
                      onClick={() => handleRevoke(token.id)}
                      disabled={actionPending}
                      style={{
                        padding: '4px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid color-mix(in srgb, var(--err) 40%, transparent)',
                        backgroundColor: 'var(--err-dim)', color: 'var(--err)',
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
