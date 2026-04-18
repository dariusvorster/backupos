export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{
        width: 380,
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 32,
      }}>
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
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
          Enter your credentials to access BackupOS
        </p>

        <form action="/api/auth/sign-in/email" method="POST">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surf2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--fg)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surf2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--fg)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '9px 16px',
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
