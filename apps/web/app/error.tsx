'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogoMark } from '@/components/ui/logo-mark'
import { authClient } from '@/lib/auth-client'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

type ErrorKind = 'permission' | 'user_action' | 'generic'

function classifyError(message: string): ErrorKind {
  if (message.startsWith('Forbidden:')) return 'permission'
  if (message.startsWith('Cannot '))    return 'user_action'
  return 'generic'
}

function copyFor(kind: ErrorKind, message: string): { title: string; body: string } {
  switch (kind) {
    case 'permission':
      return {
        title: 'Permission denied',
        body:
          message.replace(/^Forbidden:\s*/, '') ||
          'You do not have permission to perform this action.',
      }
    case 'user_action':
      return {
        title: 'Try a different action',
        body: message,
      }
    case 'generic':
      return {
        title: 'Something went wrong',
        body:
          'An unexpected error occurred. Try going back, or return to the dashboard. ' +
          'If this keeps happening, contact your administrator.',
      }
  }
}

export default function ErrorPage({ error, reset }: Props) {
  const router = useRouter()

  useEffect(() => {
    console.error('[error.tsx] caught error', { message: error.message, digest: error.digest })
  }, [error])

  const kind = classifyError(error.message)
  const { title, body } = copyFor(kind, error.message)
  const showSignOut = kind === 'permission'

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <LogoMark size={40} />
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>BackupOS</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 'var(--space-3)' }}>
          {title}
        </h1>

        <p style={{ fontSize: 14, color: 'var(--fg-mute)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
          {body}
        </p>

        {error.digest && kind !== 'permission' && (
          <div
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--fg-dim)',
              background: 'var(--surf2)',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-6)',
            }}
          >
            Error ID: {error.digest}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {kind !== 'permission' && (
            <button
              onClick={reset}
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
          )}

          <Link
            href="/"
            style={{
              background: 'var(--surf2)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Go to dashboard
          </Link>

          {showSignOut && (
            <button
              onClick={handleSignOut}
              style={{
                background: 'transparent',
                color: 'var(--fg-mute)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
