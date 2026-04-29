'use client'

import type { ConfigField } from '@/lib/integrations'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 4,
}

interface Props {
  configFields: ConfigField[]
  addAction:    (formData: FormData) => Promise<void>
}

export function IntegrationAddForm({ configFields, addAction }: Props) {
  return (
    <form action={addAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>Channel name</label>
        <input name="name" required placeholder="e.g. Ops alerts" style={inputStyle} />
      </div>

      {configFields.map(field => (
        <div key={field.name}>
          <label style={labelStyle}>
            {field.label}{!field.required && ' (optional)'}
          </label>
          {field.helpText && (
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
              {field.helpText}
            </div>
          )}
          <input
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            required={field.required}
            style={inputStyle}
          />
        </div>
      ))}

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
