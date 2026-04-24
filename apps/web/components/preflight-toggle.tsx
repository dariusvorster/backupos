'use client'

import { useTransition } from 'react'

export function PreflightToggle({
  enabled,
  action,
}: {
  enabled: boolean
  action: (formData: FormData) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  return (
    <form action={action}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: pending ? 'wait' : 'pointer' }}>
        <input
          type="checkbox"
          name="preflightEnabled"
          defaultChecked={enabled}
          onChange={e => startTransition(() => {
            const fd = new FormData(e.currentTarget.form!)
            void action(fd)
          })}
        />
        <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </label>
    </form>
  )
}
