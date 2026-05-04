'use client'

import { useState, useTransition } from 'react'
import { saveOidcConfig, disableOidc, testOidcDiscovery } from '@/app/actions/oidc-config'

interface Props {
  initial: {
    enabled:       boolean
    providerLabel: string
    discoveryUrl:  string
    clientId:      string
    scopes:        string
    buttonLabel:   string
  } | null
}

const PROVIDER_LABELS = ['Authentik', 'Okta', 'Duo', 'Custom']

export function SsoForm({ initial }: Props) {
  const [providerLabel, setProviderLabel] = useState(initial?.providerLabel ?? 'Authentik')
  const [discoveryUrl,  setDiscoveryUrl]  = useState(initial?.discoveryUrl ?? '')
  const [clientId,      setClientId]      = useState(initial?.clientId ?? '')
  const [clientSecret,  setClientSecret]  = useState('')
  const [scopes,        setScopes]        = useState(initial?.scopes ?? 'openid profile email')
  const [buttonLabel,   setButtonLabel]   = useState(initial?.buttonLabel ?? 'Sign in with SSO')
  const [enabled,       setEnabled]       = useState(initial?.enabled ?? false)

  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [discoveryStatus, setDiscoveryStatus] = useState<{ ok: boolean; text: string } | null>(null)

  function handleSave() {
    setMessage(null)
    if (!discoveryUrl.trim() || !clientId.trim()) {
      setMessage({ kind: 'err', text: 'Discovery URL and Client ID are required' })
      return
    }
    if (!initial && !clientSecret.trim()) {
      setMessage({ kind: 'err', text: 'Client Secret is required on first save' })
      return
    }
    startTransition(async () => {
      const result = await saveOidcConfig({
        enabled,
        providerLabel,
        discoveryUrl: discoveryUrl.trim(),
        clientId:     clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        scopes:       scopes.trim() || 'openid profile email',
        buttonLabel:  buttonLabel.trim() || 'Sign in with SSO',
      })
      if (result.error) {
        setMessage({ kind: 'err', text: result.error })
      } else {
        setMessage({ kind: 'ok', text: 'Saved. Restart the BackupOS service for changes to take effect.' })
        setClientSecret('')
      }
    })
  }

  function handleTestDiscovery() {
    setDiscoveryStatus(null)
    if (!discoveryUrl.trim()) return
    startTransition(async () => {
      const result = await testOidcDiscovery(discoveryUrl.trim())
      setDiscoveryStatus({ ok: result.ok, text: result.message })
    })
  }

  function handleDisable() {
    if (!confirm('Disable SSO? Existing sessions remain valid; new SSO logins will be blocked after the next service restart.')) return
    startTransition(async () => {
      const result = await disableOidc()
      if (result.error) {
        setMessage({ kind: 'err', text: result.error })
      } else {
        setEnabled(false)
        setMessage({ kind: 'ok', text: 'SSO disabled. Restart the BackupOS service for changes to take effect.' })
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }
  const fieldStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <div>
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border2)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Enable SSO</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Show &quot;Sign in with SSO&quot; on the login page</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>Enabled</span>
          </label>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Provider</label>
          <select value={providerLabel} onChange={e => setProviderLabel(e.target.value)} style={inputStyle}>
            {PROVIDER_LABELS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Discovery URL (.well-known/openid-configuration)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={discoveryUrl}
              onChange={e => setDiscoveryUrl(e.target.value)}
              placeholder="https://authentik.example.com/application/o/backupos/.well-known/openid-configuration"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleTestDiscovery}
              disabled={pending || !discoveryUrl.trim()}
              style={{
                padding: '8px 14px', fontSize: 13, whiteSpace: 'nowrap',
                background: 'var(--surf2)', color: 'var(--fg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Test
            </button>
          </div>
          {discoveryStatus && (
            <div style={{ marginTop: 6, fontSize: 12, color: discoveryStatus.ok ? 'var(--ok)' : 'var(--err)' }}>
              {discoveryStatus.ok ? '✓' : '✗'} {discoveryStatus.text}
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Client ID</label>
          <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Client Secret{initial && <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> (leave blank to keep current)</span>}
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={initial ? '••••••••' : ''}
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Scopes (space-separated)</label>
          <input type="text" value={scopes} onChange={e => setScopes(e.target.value)} style={inputStyle} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Button label on login page</label>
          <input type="text" value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} style={inputStyle} />
        </div>

      </div>

      {message && (
        <div style={{
          padding: '10px 16px', marginBottom: 16,
          backgroundColor: message.kind === 'ok' ? 'var(--ok-dim)' : 'var(--err-dim)',
          border: `1px solid color-mix(in srgb, ${message.kind === 'ok' ? 'var(--ok)' : 'var(--err)'} 30%, transparent)`,
          borderRadius: 'var(--radius-sm)', fontSize: 13,
          color: message.kind === 'ok' ? 'var(--ok)' : 'var(--err)',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={pending}
          style={{
            padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
          }}
        >
          Save changes
        </button>
        {initial && (
          <button
            onClick={handleDisable}
            disabled={pending}
            style={{
              padding: '8px 16px', background: 'var(--surf2)', color: 'var(--fg-mute)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            Disable SSO
          </button>
        )}
      </div>
    </div>
  )
}
