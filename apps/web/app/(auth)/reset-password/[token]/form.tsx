'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

interface Props { token: string }

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [done, setDone]             = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    const newPassword = form.get('password') as string
    const confirm     = form.get('confirm')  as string
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    const result = await authClient.resetPassword({ newPassword, token })
    setSubmitting(false)

    if (result.error) {
      setError(result.error.message ?? 'Reset failed — link may be expired')
      return
    }
    setDone(true)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
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

        {done ? (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Password reset</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
              Your password has been changed. All existing sessions have been signed out.
            </p>
            <button
              onClick={() => router.push('/login')}
              style={{
                width: '100%', padding: '9px 16px',
                backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Set new password</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
              Choose a new password for your BackupOS account.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>New password</label>
                <input name="password" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Confirm password</label>
                <input name="confirm" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
              </div>

              {error && <p style={{ fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', padding: '9px 16px',
                  backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontSize: 14, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  marginBottom: 12,
                }}
              >
                {submitting ? 'Resetting…' : 'Reset password'}
              </button>

              <div style={{ textAlign: 'center', fontSize: 13 }}>
                <Link href="/login" style={{ color: 'var(--fg-mute)', textDecoration: 'none' }}>
                  ← Back to sign in
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
