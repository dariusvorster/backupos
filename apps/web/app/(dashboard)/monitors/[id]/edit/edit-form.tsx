'use client'

import { useState, useTransition, useRef } from 'react'
import { updateMonitor, deleteMonitor, testMonitorConnection } from '@/app/actions/monitors'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4,
}
const fieldStyle: React.CSSProperties = { marginBottom: 16 }

interface Props { id: string; name: string; url: string; group: string }

export function EditMonitorForm({ id, name, url, group }: Props) {
  const [error, setError]           = useState('')
  const [isPending, start]          = useTransition()
  const [isDeleting, startDelete]   = useTransition()
  const [testState, setTestState]   = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testDetail, setTestDetail] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await updateMonitor(id, fd)
      if (result && 'error' in result) setError(result.error)
    })
  }

  function handleDelete() {
    if (!confirm('Delete this monitor? This cannot be undone.')) return
    startDelete(async () => { await deleteMonitor(id) })
  }

  function handleTest() {
    const u = urlRef.current?.value?.trim()
    if (!u) { setTestState('error'); setTestDetail('Enter a URL first'); return }
    setTestState('testing'); setTestDetail(null)
    void testMonitorConnection(u).then(r => {
      setTestState(r.ok ? 'ok' : 'error')
      setTestDetail(r.message)
    })
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <a href={`/monitors/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 20 }}>
        ← Monitor
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Edit monitor</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input name="name" type="text" required defaultValue={name} style={inputStyle} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={urlRef} name="url" type="url" required defaultValue={url}
                style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={handleTest} disabled={testState === 'testing'}
                style={{ padding: '8px 12px', fontSize: 12, cursor: testState === 'testing' ? 'wait' : 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surf2)', color: 'var(--fg)', flexShrink: 0 }}>
                {testState === 'testing' ? 'Testing…' : 'Test'}
              </button>
            </div>
            {testDetail && (
              <div style={{ marginTop: 6, fontSize: 11, color: testState === 'ok' ? 'var(--ok)' : 'var(--err)' }}>
                {testState === 'ok' ? '✓ ' : '✗ '}{testDetail}
              </div>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>API key / token <span style={{ fontWeight: 400, color: 'var(--fg-faint)' }}>(leave blank to keep)</span></label>
            <input name="apiKey" type="password" placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Group <span style={{ fontWeight: 400, color: 'var(--fg-faint)' }}>(optional)</span></label>
            <input name="group" type="text" defaultValue={group} placeholder="production" style={inputStyle} />
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={isPending} style={{
              padding: '8px 24px', fontSize: 13, fontWeight: 600,
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-fg)',
              cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
            }}>
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
            <a href={`/monitors/${id}`} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}>
              Cancel
            </a>
          </div>
          <button type="button" onClick={handleDelete} disabled={isDeleting} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--err)',
            background: 'transparent', color: 'var(--err)',
            cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1,
          }}>
            {isDeleting ? 'Deleting…' : 'Delete monitor'}
          </button>
        </div>
      </form>
    </div>
  )
}
