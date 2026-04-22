'use client'

import { useState }     from 'react'
import { useRouter }    from 'next/navigation'
import { authClient }   from '@/lib/auth-client'
import { acceptInvite } from '@/app/actions/invite'

interface Props {
  token:       string
  email:       string
  name:        string | null
  inviterName: string
}

export function InviteForm({ token, email, name, inviterName }: Props) {
  const router   = useRouter()
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form     = new FormData(e.currentTarget)
    const fullName = form.get('name')     as string
    const password = form.get('password') as string
    const confirm  = form.get('confirm')  as string

    if (password !== confirm) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const result = await acceptInvite(token, fullName, password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Sign in client-side to get the session cookie
    const { error: signInError } = await authClient.signIn.email({ email: result.email!, password })
    if (signInError) {
      setError('Account created — please sign in at /login')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 420, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '36px 32px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
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

        {/* Invite banner */}
        <div style={{
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            You&apos;ve been invited
          </div>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>
            <strong>{inviterName}</strong> invited you to join BackupOS
          </div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Create your account</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>Set your name and a password to get started.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} readOnly
              style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Your name</label>
            <input
              name="name" type="text" required
              defaultValue={name ?? ''}
              placeholder="Jane Doe"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Password</label>
            <input name="password" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Confirm password</label>
            <input name="confirm" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '9px 16px',
              backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 20, textAlign: 'center' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}

export function InviteError({ reason }: { reason: 'used' | 'expired' | 'invalid' }) {
  const messages: Record<string, string> = {
    used:    'This invite link has already been used.',
    expired: 'This invite link has expired.',
    invalid: 'This invite link is invalid.',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 380, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Invite unavailable</h1>
        <p style={{ fontSize: 14, color: 'var(--fg-dim)', marginBottom: 24 }}>{messages[reason]}</p>
        <a
          href="/login"
          style={{
            display: 'inline-block', padding: '9px 20px',
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--fg)', textDecoration: 'none',
          }}
        >
          Go to sign in
        </a>
      </div>
    </div>
  )
}
