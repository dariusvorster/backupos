'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function TwoFactorPage() {
  const router = useRouter()
  const [code, setCode]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [useBackup, setUseBackup] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
      : await authClient.twoFactor.verifyTotp({ code: code.trim() })

    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? 'Invalid code — try again')
    } else {
      router.push('/dashboard')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 18,
    letterSpacing: useBackup ? '0.05em' : '0.2em', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 380, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#1A1206" />
            <rect x="4" y="4" width="19" height="19" fill="#F5A623" />
            <rect x="25" y="4" width="19" height="19" fill="#854F0B" />
            <rect x="4" y="25" width="19" height="19" fill="#854F0B" />
            <rect x="25" y="25" width="19" height="19" fill="#C77A14" />
            <rect x="19" y="19" width="10" height="10" fill="#FEF5E0" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>BackupOS</span>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
          {useBackup ? 'Use a backup code' : 'Two-factor authentication'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
          {useBackup
            ? 'Enter one of your saved backup codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
            <input
              type={useBackup ? 'text' : 'text'}
              inputMode={useBackup ? 'text' : 'numeric'}
              maxLength={useBackup ? 20 : 6}
              placeholder={useBackup ? 'XXXX-XXXX' : '000000'}
              value={code}
              onChange={e => setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              style={inputStyle}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length === 0}
            style={{
              width: '100%', padding: '9px 16px',
              backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 20, textAlign: 'center' }}>
          {useBackup ? (
            <button onClick={() => { setUseBackup(false); setCode(''); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>
              Use authenticator app instead
            </button>
          ) : (
            <button onClick={() => { setUseBackup(true); setCode(''); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>
              Use a backup code instead
            </button>
          )}
        </p>
      </div>
    </div>
  )
}
