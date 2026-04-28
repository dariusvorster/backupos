'use client'

import { useState, useTransition } from 'react'

interface Props {
  testAction: () => Promise<{ ok: boolean; error?: string; deliveredTo?: string[] }>
  disabled:   boolean
  disabledReason?: string
}

export function SmtpTestButton({ testAction, disabled, disabledReason }: Props) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; error?: string; deliveredTo?: string[] } | null>(null)

  function handleClick() {
    setResult(null)
    startTransition(async () => {
      const res = await testAction()
      setResult(res)
    })
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        style={{
          padding: '8px 20px', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
          cursor: disabled || pending ? 'not-allowed' : 'pointer',
          color: 'var(--fg)', backgroundColor: 'var(--surf2)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {pending ? 'Sending…' : 'Send test email'}
      </button>

      {result && (
        <div style={{
          fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
          color:            result.ok ? 'var(--ok)'   : 'var(--err)',
          backgroundColor:  result.ok ? 'var(--ok-dim)' : 'var(--err-dim)',
          border: `1px solid color-mix(in srgb, ${result.ok ? 'var(--ok)' : 'var(--err)'} 30%, transparent)`,
        }}>
          {result.ok
            ? `Test email sent to ${result.deliveredTo!.join(', ')}`
            : `SMTP test failed: ${result.error}`}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
        Sends a test email using the saved configuration. Save changes first if you&apos;ve edited fields above.
      </div>
    </div>
  )
}
