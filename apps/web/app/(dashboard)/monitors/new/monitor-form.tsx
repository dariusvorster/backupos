'use client'

import { useRef, useState, useTransition } from 'react'
import { createMonitor, testMonitorConnection } from '@/app/actions/monitors'

const MONITOR_TYPES = [
  { value: 'proxmox_pbs', label: 'Proxmox PBS',  desc: 'Proxmox Backup Server' },
  { value: 'borg',        label: 'BorgBackup',    desc: 'Borg repository via borgmatic or SSH' },
  { value: 'duplicati',   label: 'Duplicati',     desc: 'Duplicati web API' },
  { value: 'veeam',       label: 'Veeam',         desc: 'Veeam Backup & Replication REST API' },
  { value: 'restic_repo', label: 'Restic repo',   desc: 'Restic repository (REST server or S3)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: 'var(--fg-mute)',
  marginBottom: 6, fontWeight: 500,
}

export function MonitorForm() {
  const urlRef = useRef<HTMLInputElement>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, startTesting] = useTransition()

  function handleTest() {
    const url = urlRef.current?.value?.trim()
    if (!url) { setTestResult({ ok: false, message: 'Enter a URL first' }); return }
    setTestResult(null)
    startTesting(async () => {
      const result = await testMonitorConnection(url)
      setTestResult(result)
    })
  }

  return (
    <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <form action={createMonitor}>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Monitor name</label>
          <input name="name" type="text" required placeholder="My PBS server" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {MONITOR_TYPES.map(mt => (
              <label key={mt.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}>
                <input type="radio" name="type" value={mt.value} defaultChecked={mt.value === 'proxmox_pbs'} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{mt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{mt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={urlRef}
              name="url"
              type="url"
              required
              placeholder="https://pbs.example.com:8007"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              style={{
                padding: '8px 14px', fontSize: 13, cursor: testing ? 'default' : 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surf2)', color: 'var(--fg)', flexShrink: 0,
                opacity: testing ? 0.6 : 1,
              }}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>
          {testResult && (
            <div style={{
              marginTop: 8, fontSize: 12, padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: testResult.ok ? 'color-mix(in srgb, var(--surf2) 80%, var(--ok) 20%)' : 'color-mix(in srgb, var(--surf2) 80%, var(--err) 20%)',
              color: testResult.ok ? 'var(--ok)' : 'var(--err)',
              border: `1px solid ${testResult.ok ? 'var(--ok)' : 'var(--err)'}`,
            }}>
              {testResult.ok ? '✓' : '✗'} {testResult.message}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>API key / token <span style={{ fontWeight: 400, color: 'var(--fg-dim)' }}>(optional)</span></label>
          <input name="apiKey" type="password" placeholder="••••••••" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>Group <span style={{ fontWeight: 400, color: 'var(--fg-dim)' }}>(optional)</span></label>
          <input name="group" type="text" placeholder="production" style={inputStyle} />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Groups monitors together on the monitors list for easier filtering.
          </div>
        </div>

        <button
          type="submit"
          style={{
            padding: '8px 20px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff', fontWeight: 500,
          }}
        >
          Add monitor
        </button>
      </form>
    </div>
  )
}
