'use client'

import { useState, useTransition } from 'react'
import { createPbsToken, revokePbsToken } from '@/app/actions/pbs-tokens'
import { CopyButton } from '@/components/copy-button'

interface Token {
  id:          string
  user:        string
  realm:       string
  tokenName:   string
  permissions: string
  expiresAt:   Date | null
  lastUsedAt:  Date | null
  createdAt:   Date
}

const PERM_OPTIONS = [
  { value: 'read',  label: 'Read — list snapshots, download chunks' },
  { value: 'write', label: 'Write — create and upload backups' },
  { value: 'full',  label: 'Full — read, write, and manage datastores' },
] as const

function permLabel(p: string): string {
  return PERM_OPTIONS.find(o => o.value === p)?.label.split(' — ')[0] ?? p
}

interface CreatedSecret { authId: string; secret: string }

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-dim)', width: 80, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <code style={{ fontSize: 12, flex: 1, minWidth: 0, wordBreak: 'break-all', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--fg)' }}>{value}</code>
      <CopyButton text={value} />
    </div>
  )
}

export function PbsTokensClient({ initial }: { initial: Token[] }) {
  const [tokens, setTokens]       = useState(initial)
  const [created, setCreated]     = useState<CreatedSecret | null>(null)
  const [error, setError]         = useState('')
  const [pending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setCreated(null)
    const fd = new FormData(e.currentTarget)
    const result = await createPbsToken(fd)
    if (result.error) { setError(result.error); return }
    if (result.authId && result.secret && result.id) {
      setCreated({ authId: result.authId, secret: result.secret })
      setTokens(prev => [...prev, {
        id:          result.id!,
        user:        String(fd.get('user') ?? ''),
        realm:       String(fd.get('realm') ?? 'pbs'),
        tokenName:   String(fd.get('tokenName') ?? ''),
        permissions: String(fd.get('permissions') ?? 'read'),
        expiresAt:   fd.get('expires') ? new Date(String(fd.get('expires'))) : null,
        lastUsedAt:  null,
        createdAt:   new Date(),
      }])
    }
    ;(e.target as HTMLFormElement).reset()
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokePbsToken(id)
      setTokens(t => t.filter(tk => tk.id !== id))
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
    width: '100%',
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <a href="/pbs" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← PBS</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>PBS API tokens</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 28 }}>
        Tokens authenticate PVE hosts connecting to the PBS-compatible endpoint.
      </p>

      {created && (
        <div style={{ marginBottom: 20, padding: '12px 16px', backgroundColor: 'var(--surf2)', border: '1px solid var(--success,#22c55e)', borderRadius: 'var(--radius-sm)' }}>
          <p style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 10, fontWeight: 600 }}>
            Token created — copy the secret now, it won&apos;t be shown again:
          </p>
          <CredentialRow label="Username" value={created.authId} />
          <CredentialRow label="Password" value={created.secret} />
          <p style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 8, marginBottom: 0 }}>
            In PVE: paste <strong>Username</strong> into the Username field and <strong>Password</strong> into the Password field.
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12, marginBottom: 32, padding: '16px', backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>New token</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label htmlFor="pbs-user" style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>User</label>
            <input id="pbs-user" name="user" required placeholder="root" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pbs-realm" style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Realm</label>
            <input id="pbs-realm" name="realm" defaultValue="pbs" required style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pbs-tokenName" style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Token name</label>
            <input id="pbs-tokenName" name="tokenName" required placeholder="pve-host-1" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="pbs-permissions" style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Permissions</label>
            <select id="pbs-permissions" name="permissions" defaultValue="read" style={inputStyle}>
              {PERM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pbs-expires" style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Expires (optional)</label>
            <input id="pbs-expires" name="expires" type="datetime-local" style={inputStyle} />
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--error,#ef4444)', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={pending} style={{ justifySelf: 'start', padding: '8px 16px', fontSize: 13, fontWeight: 500, backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
          Create token
        </button>
      </form>

      {tokens.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>No tokens yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {(['Identity', 'Permissions', 'Expires', 'Last used', ''] as const).map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: 'var(--fg-dim)', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.map(tk => (
              <tr key={tk.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px', color: 'var(--fg)' }}>
                  <code style={{ fontSize: 12 }}>{tk.user}@{tk.realm}!{tk.tokenName}</code>
                </td>
                <td style={{ padding: '8px', color: 'var(--fg-dim)' }}>{permLabel(tk.permissions)}</td>
                <td style={{ padding: '8px', color: 'var(--fg-dim)' }}>{tk.expiresAt ? new Date(tk.expiresAt).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '8px', color: 'var(--fg-dim)' }}>{tk.lastUsedAt ? new Date(tk.lastUsedAt).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '8px' }}>
                  <button
                    onClick={() => handleRevoke(tk.id)}
                    disabled={pending}
                    style={{ padding: '4px 10px', fontSize: 12, backgroundColor: 'transparent', color: 'var(--error,#ef4444)', border: '1px solid var(--error,#ef4444)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
