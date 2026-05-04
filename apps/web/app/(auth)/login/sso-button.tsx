'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

interface Props {
  buttonLabel: string
}

export function SsoButton({ buttonLabel }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.oauth2({
        providerId:  'oidc',
        callbackURL: '/dashboard',
      })
      if (result.error) {
        setError(result.error.message ?? 'SSO sign-in failed')
        setLoading(false)
      }
      // better-auth handles the redirect on success; nothing else needed.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO sign-in failed')
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '20px 0', fontSize: 12, color: 'var(--fg-dim)',
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          width: '100%', padding: '9px 16px',
          backgroundColor: 'var(--surf2)', color: 'var(--fg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Redirecting…' : buttonLabel}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--err)', marginTop: 12 }}>{error}</p>
      )}
    </>
  )
}
