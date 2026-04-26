'use client'

import { useState } from 'react'
import { validateCron } from '@/lib/cron-validate'

interface Props {
  name: string
  defaultValue?: string
  required?: boolean
  style?: React.CSSProperties
  serverError?: string
}

const HINT = 'Standard cron. e.g. 0 2 * * * = daily at 02:00'
const EXAMPLES = '"0 2 * * *" (daily 2am), "*/15 * * * *" (every 15min).'

export function CronInput({ name, defaultValue = '', required, style, serverError }: Props) {
  const initError = serverError ?? (() => {
    if (!defaultValue) return null
    const r = validateCron(defaultValue)
    return r.valid ? null : r.error
  })()

  const [error, setError] = useState<string | null>(initError)

  return (
    <>
      <input
        name={name}
        type="text"
        required={required}
        defaultValue={defaultValue}
        onChange={e => {
          const v = e.target.value.trim()
          if (!v) { setError(null); return }
          const r = validateCron(v)
          setError(r.valid ? null : r.error)
        }}
        style={{ ...style, ...(error ? { borderColor: 'var(--err)' } : {}) }}
      />
      {error ? (
        <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>
          {error}. Examples: {EXAMPLES}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>{HINT}</div>
      )}
    </>
  )
}
