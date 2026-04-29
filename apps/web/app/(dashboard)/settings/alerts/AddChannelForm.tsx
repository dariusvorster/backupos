'use client'

import { useState } from 'react'
import { createAlertChannel } from '@/app/actions/alerts'

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

  return (
    <form action={createAlertChannel} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      <button
        type="submit"
        style={{
          alignSelf: 'flex-start', padding: '7px 18px', fontSize: 13, fontWeight: 500,
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
        }}
      >
        Add channel
      </button>
    </form>
  )
}
