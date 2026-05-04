'use client'

import Link from 'next/link'
import { useState } from 'react'
import { requestPasswordReset } from '@/app/actions/forgot-password'

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage]       = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const result = await requestPasswordReset(new FormData(e.currentTarget))
    setSubmitting(false)
    setMessage(result.error ?? result.message)
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

        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Reset password</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Email</label>
            <input name="email" type="email" required placeholder="you@example.com" style={inputStyle} />
          </div>

          {message && (
            <div style={{
              fontSize: 13,
              color: 'var(--fg)',
              backgroundColor: 'var(--surf2)',
              border: '1px solid var(--border)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
            }}>
              {message}
            </div>
          )}

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
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 13 }}>
            <Link href="/login" style={{ color: 'var(--fg-mute)', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
