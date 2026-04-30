'use client'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalErrorPage({ error, reset }: Props) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0A0A0A', color: '#EDEDED' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#141414',
              border: '1px solid #242424',
              borderRadius: 12,
              padding: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="BackupOS">
                <rect width="48" height="48" rx="16" fill="#1A1206" />
                <rect x="6"  y="6"  width="16" height="16" rx="2" fill="#F5A623" />
                <rect x="26" y="6"  width="16" height="16" rx="2" fill="#854F0B" />
                <rect x="6"  y="26" width="16" height="16" rx="2" fill="#854F0B" />
                <rect x="26" y="26" width="16" height="16" rx="2" fill="#C77A14" />
                <rect x="18" y="18" width="12" height="12" rx="2" fill="#FEF5E0" />
              </svg>
              <span style={{ fontSize: 16, fontWeight: 600 }}>BackupOS</span>
            </div>

            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Application error</h1>

            <p style={{ fontSize: 14, color: '#9A9A9A', lineHeight: 1.5, marginBottom: 24 }}>
              The application encountered a critical error and could not load. Try reloading the page.
              If this keeps happening, contact your administrator.
            </p>

            {error.digest && (
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'ui-monospace, monospace',
                  color: '#6B6B6B',
                  background: '#1A1A1A',
                  border: '1px solid #2E2E2E',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 24,
                }}
              >
                Error ID: {error.digest}
              </div>
            )}

            <button
              onClick={reset}
              style={{
                background: '#F5A623',
                color: '#000000',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
