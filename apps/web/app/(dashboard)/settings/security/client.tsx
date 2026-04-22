'use client'

import { useState, useTransition } from 'react'
import { TotpSetupModal } from '@/components/totp-setup-modal'
import { changePassword }  from '@/app/actions/user'
import { disableTotp }     from '@/app/actions/totp'

interface Props {
  twoFactorEnabled: boolean
  hasTotpRecord:    boolean
}

export function SecurityClient({ twoFactorEnabled, hasTotpRecord }: Props) {
  const [showTotp, setShowTotp]         = useState(false)
  const [tfEnabled, setTfEnabled]       = useState(twoFactorEnabled)
  const [disableCode, setDisableCode]   = useState('')
  const [pwError, setPwError]           = useState('')
  const [pwSuccess, setPwSuccess]       = useState(false)
  const [disableError, setDisableError] = useState('')
  const [isPwPending, startPwTransition]      = useTransition()
  const [isTotpPending, startTotpTransition]  = useTransition()

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    const fd = new FormData(e.currentTarget)
    startPwTransition(async () => {
      const result = await changePassword(fd)
      if (result.error) { setPwError(result.error); return }
      setPwSuccess(true)
      ;(e.target as HTMLFormElement).reset()
    })
  }

  function handleDisableTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDisableError('')
    const fd = new FormData()
    fd.set('code', disableCode)
    startTotpTransition(async () => {
      const result = await disableTotp(fd)
      if (result.error) { setDisableError(result.error); return }
      setTfEnabled(false)
      setDisableCode('')
    })
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
  }

  // hasTotpRecord is retained for potential future use (e.g. showing different UI
  // when a DB record exists but twoFactorEnabled flag is false)
  void hasTotpRecord

  return (
    <div style={{ maxWidth: 640 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Security</h1>

      {/* Password section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Change password</h2>
        {pwSuccess && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--ok-dim)', border: '1px solid var(--ok)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)', marginBottom: 16 }}>
            Password updated successfully.
          </div>
        )}
        {pwError && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>
            {pwError}
          </div>
        )}
        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {([
            { name: 'currentPassword', label: 'Current password' },
            { name: 'newPassword',     label: 'New password' },
            { name: 'confirm',         label: 'Confirm new password' },
          ] as const).map(f => (
            <div key={f.name}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>{f.label}</label>
              <input name={f.name} type="password" required style={fieldStyle} />
            </div>
          ))}
          <div>
            <button type="submit" disabled={isPwPending} style={{
              padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              {isPwPending ? 'Saving\u2026' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 32 }} />

      {/* TOTP section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Two-factor authentication</h2>
        {!tfEnabled ? (
          <div style={{ padding: 20, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 16 }}>
              Two-factor authentication is <strong>off</strong>. Add a TOTP authenticator to protect your account even if your password is leaked.
            </p>
            <button
              onClick={() => setShowTotp(true)}
              style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Enable TOTP
            </button>
          </div>
        ) : (
          <div style={{ padding: 20, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ color: 'var(--ok)', fontWeight: 600 }}>&#10003;</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>TOTP authenticator enabled</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 12 }}>
              Enter a TOTP code from your authenticator app to disable two-factor authentication.
            </p>
            {disableError && (
              <div style={{ padding: '6px 10px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 10 }}>
                {disableError}
              </div>
            )}
            <form onSubmit={handleDisableTotp} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...fieldStyle, width: 120, letterSpacing: '0.15em', fontSize: 16 }}
              />
              <button type="submit" disabled={isTotpPending || disableCode.length < 6} style={{
                padding: '8px 14px', backgroundColor: 'var(--err)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {isTotpPending ? 'Disabling\u2026' : 'Disable TOTP'}
              </button>
            </form>
          </div>
        )}
      </section>

      {showTotp && (
        <TotpSetupModal
          onClose={() => setShowTotp(false)}
          onEnabled={() => setTfEnabled(true)}
        />
      )}
    </div>
  )
}
