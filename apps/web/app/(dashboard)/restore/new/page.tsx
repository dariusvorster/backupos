'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { validateSpec, createSpec } from '@/app/actions/restore'

const EXAMPLE_YAML = `name: my-service-full
description: Full restore of my-service
version: "1.0"
repository: homelab-r2

steps:
  - name: Restore database
    type: database_restore
    app: postgres
    snapshot_path: /tmp/backupos-pg-myservice.sql.gz
    target:
      container: myservice-db
      database: myservice
      username: myservice
    on_failure: abort

  - name: Restore data volume
    type: filesystem_restore
    snapshot_path: /data/myservice
    target_path: /data/myservice
    on_failure: abort

  - name: Restart service
    type: shell
    command: docker compose -f /opt/myservice/docker-compose.yml up -d
    on_failure: abort

  - name: Health check
    type: http_check
    url: http://localhost:8080/health
    expected_status: 200
    timeout_seconds: 30
    retry_count: 5
    on_failure: notify_only`

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
}

export default function NewRestoreSpecPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [yaml, setYaml] = useState(EXAMPLE_YAML)
  const [validation, setValidation] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError] = useState('')
  const [isValidating, startValidating] = useTransition()
  const [isSaving, startSaving] = useTransition()

  function handleValidate() {
    setValidation(null)
    startValidating(async () => {
      const result = await validateSpec(yaml)
      if (result.ok) {
        setValidation({ ok: true, message: 'YAML is valid — all steps parsed successfully.' })
      } else {
        setValidation({ ok: false, message: result.error })
      }
    })
  }

  function handleSave() {
    setError('')
    startSaving(async () => {
      const result = await createSpec(name, yaml)
      if (result && 'error' in result) setError(result.error)
      // on success createSpec calls redirect() — nothing else needed
    })
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <a href="/restore" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 20 }}>← Restore</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>New restore spec</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
        Define your restore procedure as YAML. Validate before saving to catch errors early.
      </p>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>Name</label>
          <input
            type="text"
            placeholder="my-service-full"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>YAML spec</label>
          <textarea
            value={yaml}
            onChange={e => { setYaml(e.target.value); setValidation(null) }}
            rows={28}
            style={{
              ...inputStyle,
              fontSize: 12, fontFamily: 'var(--font-mono)',
              lineHeight: 1.6, resize: 'vertical',
            }}
          />
        </div>

        {validation && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13,
            backgroundColor: validation.ok ? 'var(--ok-dim)' : 'var(--err-dim)',
            border: `1px solid ${validation.ok ? 'color-mix(in srgb, var(--ok) 30%, transparent)' : 'color-mix(in srgb, var(--err) 30%, transparent)'}`,
            color: validation.ok ? 'var(--ok)' : 'var(--err)',
          }}>
            {validation.message}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleValidate}
            disabled={isValidating}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg)',
              opacity: isValidating ? 0.6 : 1,
            }}
          >
            {isValidating ? 'Validating…' : 'Validate'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-fg)',
              opacity: isSaving || !name.trim() ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving…' : 'Save spec'}
          </button>
        </div>
      </div>
    </div>
  )
}
