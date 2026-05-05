import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'

export const metadata = { title: 'Access denied — BackupOS' }

export default async function AccessDeniedPage() {
  const u = await getCurrentUser()
  if (!u) redirect('/login')
  if (u.role === 'admin') redirect('/dashboard')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh',
    }}>
      <div style={{
        maxWidth: 480, width: '100%',
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 40,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
          Access denied
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-mute)', lineHeight: 1.6, marginBottom: 24 }}>
          This page requires admin role. You&apos;re signed in as{' '}
          <strong style={{ color: 'var(--fg)' }}>{u.email}</strong>.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '9px 18px',
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14, fontWeight: 500, textDecoration: 'none',
          }}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
