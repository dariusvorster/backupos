'use client'

import { useActionState } from 'react'
import { applyLicenseKey, clearLicenseKey } from '@/app/actions/license'

export function LicenseClient({ currentKey }: { currentKey: string | null }) {
  const [state, formAction, pending] = useActionState(applyLicenseKey, undefined)

  return (
    <div style={{
      backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>License key</div>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.5 }}>
        Enter a license key from <strong>license.backupos.app</strong> to unlock higher tiers.
      </p>

      {currentKey && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 13,
        }}>
          <span style={{ color: 'var(--fg-mute)', fontFamily: 'monospace' }}>
            {currentKey.slice(0, 8)}••••••••
          </span>
          <button
            onClick={() => clearLicenseKey()}
            style={{
              fontSize: 12, color: 'var(--danger)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Remove
          </button>
        </div>
      )}

      <form action={formAction} style={{ display: 'flex', gap: 8 }}>
        <input
          name="licenseKey"
          placeholder="bkpos_live_xxxxxxxxxxxx"
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg)', color: 'var(--fg)',
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            backgroundColor: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}
        >
          {pending ? 'Applying…' : 'Apply'}
        </button>
      </form>

      {state?.error && (
        <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{state.error}</p>
      )}
    </div>
  )
}
