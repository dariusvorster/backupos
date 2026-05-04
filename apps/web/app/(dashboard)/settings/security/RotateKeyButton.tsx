'use client'

import { useState, useTransition } from 'react'
import { rotateEncryptionKeyAction } from '@/app/actions/security'

export function RotateKeyButton() {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const onConfirm = () => {
    setConfirming(false)
    startTransition(async () => {
      const r = await rotateEncryptionKeyAction()
      if (r.ok && r.stats) {
        setResult({
          ok: true,
          message: `Rotation complete: ${r.stats.total} fields re-encrypted in ${r.stats.durationMs}ms. Service will restart momentarily.`,
        })
      } else {
        setResult({ ok: false, message: r.error ?? 'unknown error' })
      }
    })
  }

  return (
    <div>
      {!confirming && !result && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          style={{
            padding: '8px 14px', fontSize: 13, cursor: pending ? 'not-allowed' : 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surf2)', color: 'var(--err)',
          }}
        >
          Rotate encryption key
        </button>
      )}

      {confirming && (
        <div style={{
          padding: 12, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--surf2)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 10 }}>
            This will re-encrypt every stored secret with a new key and restart the
            service. The old key will be replaced; back it up first if you need it.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              style={{
                padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--err)',
                background: 'var(--err)', color: '#fff',
              }}
            >
              {pending ? 'Rotating…' : 'Confirm rotate'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              style={{
                padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surf2)', color: 'var(--fg)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div style={{
          padding: 12, borderRadius: 'var(--radius-sm)',
          border: `1px solid ${result.ok ? 'var(--ok)' : 'var(--err)'}`,
          background: 'var(--surf2)',
          fontSize: 13, color: result.ok ? 'var(--ok)' : 'var(--err)',
        }}>
          {result.message}
        </div>
      )}
    </div>
  )
}
