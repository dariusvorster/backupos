'use client'

import { useState, useTransition } from 'react'
import { createApiToken, revokeApiToken } from '@/app/actions/api-tokens'

interface Token {
  id: string
  name: string
  tokenPrefix: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export function ApiTokensClient({ initial }: { initial: Token[] }) {
  const [tokens, setTokens] = useState(initial)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setNewToken(null)
    const fd = new FormData(e.currentTarget)
    const result = await createApiToken(fd)
    if (result.error) { setError(result.error); return }
    if (result.token) setNewToken(result.token)
    ;(e.target as HTMLFormElement).reset()
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeApiToken(id)
      setTokens(t => t.filter(tk => tk.id !== id))
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>API tokens</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Tokens for authenticating API requests. Shown once — store them securely.</p>

      {newToken && (
        <div style={{ backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)', marginBottom: 6 }}>Token created — copy it now, it won&apos;t be shown again</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', wordBreak: 'break-all' }}>{newToken}</div>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleCreate} style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Create new token</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Token name</label>
            <input name="name" type="text" required placeholder="e.g. CI pipeline" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Expires (optional)</label>
            <input name="expires" type="date" style={inputStyle} />
          </div>
          <button type="submit" style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Generate
          </button>
        </div>
      </form>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Active tokens ({tokens.length})
        </div>
        {tokens.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>No tokens yet.</div>
        ) : tokens.map(tk => (
          <div key={tk.id} style={{ padding: '12px 20px', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{tk.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
                {tk.tokenPrefix}… · Created {new Date(tk.createdAt).toLocaleDateString()}
                {tk.expiresAt ? ` · Expires ${new Date(tk.expiresAt).toLocaleDateString()}` : ''}
                {tk.lastUsedAt ? ` · Last used ${new Date(tk.lastUsedAt).toLocaleDateString()}` : ' · Never used'}
              </div>
            </div>
            <button
              onClick={() => handleRevoke(tk.id)}
              disabled={pending}
              style={{ padding: '4px 10px', backgroundColor: 'var(--err-dim)', color: 'var(--err)', border: '1px solid color-mix(in srgb, var(--err) 25%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
