'use client'

import { useState, useTransition } from 'react'
import { validateSpec, updateSpec } from '@/app/actions/restore'
import { Button } from '@/components/ui/button'

interface Props {
  specId: string
  initialName: string
  initialYaml: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
}

export function EditSpecButton({ specId, initialName, initialYaml }: Props) {
  const [editing, setEditing]       = useState(false)
  const [name, setName]             = useState(initialName)
  const [yaml, setYaml]             = useState(initialYaml)
  const [validation, setValidation] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError]           = useState('')
  const [isValidating, startValidating] = useTransition()
  const [isSaving, startSaving]         = useTransition()

  function handleValidate() {
    setValidation(null)
    startValidating(async () => {
      const result = await validateSpec(yaml)
      setValidation(result.ok
        ? { ok: true,  message: 'YAML is valid.' }
        : { ok: false, message: result.error })
    })
  }

  function handleSave() {
    setError('')
    startSaving(async () => {
      const result = await updateSpec(specId, name, yaml)
      if (result && 'error' in result) setError(result.error)
    })
  }

  if (!editing) {
    return (
      <Button variant="secondary" size="md" onClick={() => setEditing(true)}>Edit</Button>
    )
  }

  return (
    <div style={{ marginTop: 24, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Edit spec</div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500 }}>Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500 }}>YAML spec</label>
        <textarea
          value={yaml}
          onChange={e => { setYaml(e.target.value); setValidation(null) }}
          rows={24}
          style={{ ...inputStyle, fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6, resize: 'vertical' }}
        />
      </div>

      {validation && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--radius-sm)', fontSize: 13,
          backgroundColor: validation.ok ? 'var(--ok-dim)' : 'var(--err-dim)',
          color: validation.ok ? 'var(--ok)' : 'var(--err)',
        }}>
          {validation.message}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleValidate}
          disabled={isValidating}
          style={{ padding: '7px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surf2)', color: 'var(--fg)', opacity: isValidating ? 0.6 : 1 }}
        >
          {isValidating ? 'Validating…' : 'Validate'}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)', opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => { setEditing(false); setName(initialName); setYaml(initialYaml); setValidation(null); setError('') }}
          style={{ padding: '7px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-dim)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
