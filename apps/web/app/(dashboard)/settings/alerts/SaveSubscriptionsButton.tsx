'use client'

import { useFormStatus } from 'react-dom'

export function SaveSubscriptionsButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        cursor: pending ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--surf2)',
        color: pending ? 'var(--fg-mute)' : 'var(--fg)',
        opacity: pending ? 0.7 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}
