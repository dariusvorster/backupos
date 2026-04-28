'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'
import { authClient } from '@/lib/auth-client'

interface Props { onClose: () => void; onEnabled: () => void }

export function TotpSetupModal({ onClose, onEnabled }: Props) {
  const [step, setStep]               = useState<1 | 2 | 3>(1)
  const [password, setPassword]       = useState('')
  const [uri, setUri]                 = useState('')
  const [code, setCode]               = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  async function handleInit() {
    setError('')
    setLoading(true)
    const result = await authClient.twoFactor.enable({ password })
    setPassword('')
    setLoading(false)
    if (result.error) { setError(result.error.message ?? 'Failed to initialise 2FA'); return }
    if (!result.data) { setError('Unexpected empty response'); return }
    setUri(result.data.totpURI)
    setBackupCodes(result.data.backupCodes)
    setStep(2)
  }

  async function handleVerify() {
    setError('')
    setLoading(true)
    const result = await authClient.twoFactor.verifyTotp({ code })
    setLoading(false)
    if (result.error) { setError(result.error.message ?? 'Invalid code — try again'); return }
    setStep(3)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 400,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const modal: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: 28, width: 440, maxWidth: '90vw',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 20 }}>
          {step === 1 && 'Enable two-factor authentication'}
          {step === 2 && 'Scan QR code'}
          {step === 3 && 'Save backup codes'}
        </h2>

        {error && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 20, lineHeight: 1.6 }}>
              Adding a TOTP authenticator protects your account even if your password is leaked. You will need your authenticator app every time you sign in.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 4 }}>
                Confirm your password
              </label>
              <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 8 }}>
                Required to enable 2FA on your account.
              </p>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--fg)' }}>Cancel</button>
              <button onClick={handleInit} disabled={loading || password.length === 0} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Loading…' : 'Continue →'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
              <div style={{ flexShrink: 0, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
                <QRCode value={uri} size={160} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 8 }}>
                  Scan with 1Password, Authy, Google Authenticator, or any TOTP app.
                </p>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
              Enter the 6-digit code from your app to verify
            </label>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 18,
                letterSpacing: '0.2em', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--fg)' }}>Cancel</button>
              <button onClick={handleVerify} disabled={loading || code.length < 6} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Verifying…' : 'Verify & enable'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.6 }}>
              Two-factor authentication is now enabled. Save these backup codes somewhere safe — each can be used once if you lose access to your TOTP app.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16,
            }}>
              {backupCodes.map(c => (
                <code key={c} style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--fg)', letterSpacing: '0.05em' }}>{c}</code>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join('\n')).catch(() => {
                    window.prompt('Copy your backup codes:', backupCodes.join('\n'))
                  })
                }}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--fg)' }}
              >
                Copy all
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(backupCodes.join('\n'))}`}
                download="backupos-backup-codes.txt"
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', color: 'var(--fg)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Download .txt
              </a>
            </div>
            <button
              onClick={() => { onEnabled(); onClose() }}
              style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Done — I&apos;ve saved my codes
            </button>
          </>
        )}
      </div>
    </div>
  )
}
