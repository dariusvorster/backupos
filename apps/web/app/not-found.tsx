import Link from 'next/link'
import { LogoMark } from '@/components/ui/logo-mark'

export default function NotFound() {
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
          Page not found
        </h1>

        <p style={{ fontSize: 14, color: 'var(--fg-mute)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
          The page you were looking for does not exist or has been moved.
        </p>

        <Link
          href="/"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            border: 'none',
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
      </div>
    </div>
  )
}
