'use client'

import { useState, useRef, useTransition } from 'react'
import { createAlertChannel, testAlertChannel } from '@/app/actions/alerts'

function buildConfigFromForm(type: string, fd: FormData): Record<string, string> | null {
  const get = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : '' }
  if (type === 'discord' || type === 'slack' || type === 'webhook') {
    const url = get('url'); if (!url) return null; return { url }
  }
  if (type === 'zulip') {
    const url = get('url'), email = get('email'), apiKey = get('apiKey'), stream = get('stream')
    if (!url || !email || !apiKey || !stream) return null
    const cfg: Record<string, string> = { url, email, apiKey, stream }
    const topic = get('topic'); if (topic) cfg.topic = topic
    return cfg
  }
  if (type === 'telegram') {
    const botToken = get('botToken'), chatId = get('chatId')
    if (!botToken || !chatId) return null
    return { botToken, chatId }
  }
  if (type === 'pagerduty') {
    const integrationKey = get('integrationKey'); if (!integrationKey) return null; return { integrationKey }
  }
  if (type === 'ntfy') {
    const url = get('url'), topic = get('topic')
    if (!url || !topic) return null
    const cfg: Record<string, string> = { url, topic }
    const auth = get('auth'); if (auth) cfg.auth = auth
    return cfg
  }
  if (type === 'gotify') {
    const url = get('url'), appToken = get('appToken')
    if (!url || !appToken) return null; return { url, appToken }
  }
  if (type === 'pushover') {
    const apiToken = get('apiToken'), userKey = get('userKey')
    if (!apiToken || !userKey) return null; return { apiToken, userKey }
  }
  return null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4,
}

function Field({ label, name, type = 'text', placeholder, required }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>{label}{required ? '' : ' (optional)'}</label>
      <input name={name} type={type} placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

export function AddChannelForm() {
  const [type, setType] = useState('discord')
  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'sending' | 'success' | 'error'; message?: string }>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement | null>(null)

  function handleTest() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const config = buildConfigFromForm(type, fd)
    if (!config) {
      setTestStatus({ kind: 'error', message: 'Fill in the required fields before testing.' })
      return
    }
    setTestStatus({ kind: 'sending' })
    startTransition(async () => {
      const result = await testAlertChannel({ kind: 'unsaved', type, config })
      if (result.ok) {
        setTestStatus({ kind: 'success' })
      } else {
        setTestStatus({ kind: 'error', message: result.error })
      }
    })
  }

  return (
    <form ref={formRef} action={createAlertChannel} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>Name</label>
        <input name="name" required placeholder="e.g. Ops Discord" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Type</label>
        <select
          name="type"
          required
          value={type}
          onChange={e => setType(e.target.value)}
          style={inputStyle}
        >
          <option value="discord">Discord</option>
          <option value="slack">Slack</option>
          <option value="webhook">Generic webhook</option>
          <option value="zulip">Zulip</option>
          <option value="telegram">Telegram</option>
          <option value="pagerduty">PagerDuty</option>
          <option value="ntfy">ntfy</option>
          <option value="gotify">Gotify</option>
          <option value="pushover">Pushover</option>
        </select>
      </div>

      {/* URL-based types */}
      {['discord', 'slack', 'webhook', 'zulip', 'ntfy', 'gotify'].includes(type) && (
        <Field label="URL" name="url" type="url" placeholder="https://…" required />
      )}

      {/* Zulip-specific */}
      {type === 'zulip' && <>
        <Field label="Bot email" name="email" placeholder="bot@example.com" required />
        <Field label="API key" name="apiKey" placeholder="Zulip bot API key" required />
        <Field label="Stream" name="stream" placeholder="e.g. ops-alerts" required />
        <Field label="Topic" name="topic" placeholder="e.g. BackupOS alerts" />
      </>}

      {/* Telegram */}
      {type === 'telegram' && <>
        <Field label="Bot token" name="botToken" placeholder="1234567890:ABC…" required />
        <Field label="Chat ID" name="chatId" placeholder="-100123456789" required />
      </>}

      {/* PagerDuty */}
      {type === 'pagerduty' && (
        <Field label="Integration key" name="integrationKey" placeholder="Events API v2 routing key" required />
      )}

      {/* ntfy-specific */}
      {type === 'ntfy' && <>
        <Field label="Topic" name="topic" placeholder="my-backup-alerts" required />
        <Field label="Authorization header" name="auth" placeholder="Bearer tk_…" />
      </>}

      {/* Gotify */}
      {type === 'gotify' && (
        <Field label="App token" name="appToken" placeholder="Gotify app token" required />
      )}

      {/* Pushover */}
      {type === 'pushover' && <>
        <Field label="API token" name="apiToken" placeholder="Pushover application token" required />
        <Field label="User key" name="userKey" placeholder="Pushover user/group key" required />
      </>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="submit"
          style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff', cursor: 'pointer',
          }}
        >
          Add channel
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={isPending}
          style={{
            padding: '7px 14px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surf2)', color: 'var(--fg)', cursor: 'pointer',
          }}
        >
          {isPending ? 'Sending…' : 'Test'}
        </button>
        {testStatus.kind === 'success' && (
          <span style={{ fontSize: 12, color: 'var(--ok)' }}>Test message delivered</span>
        )}
        {testStatus.kind === 'error' && (
          <span style={{ fontSize: 12, color: 'var(--err)' }}>{testStatus.message}</span>
        )}
      </div>
    </form>
  )
}
