'use client'

import { useState, useTransition } from 'react'
import { updatePbsDatastore } from '@/app/actions/pbs-datastores'
import { Button } from '@/components/ui/button'

interface Props {
  id:                   string
  initialPruneSchedule: string
  initialGcSchedule:    string
}

export function EditScheduleForm({ id, initialPruneSchedule, initialGcSchedule }: Props) {
  const [pruneSchedule, setPruneSchedule] = useState(initialPruneSchedule)
  const [gcSchedule, setGcSchedule]       = useState(initialGcSchedule)
  const [error, setError]                 = useState<string | null>(null)
  const [savedAt, setSavedAt]             = useState<number | null>(null)
  const [isPending, startTransition]      = useTransition()

  const dirty = pruneSchedule !== initialPruneSchedule || gcSchedule !== initialGcSchedule

  function onSave() {
    setError(null)
    startTransition(async () => {
      const result = await updatePbsDatastore({
        id,
        pruneSchedule: pruneSchedule.trim() || null,
        gcSchedule:    gcSchedule.trim() || null,
      })
      if (result.error) { setError(result.error); return }
      setSavedAt(Date.now())
    })
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '6px 10px', fontSize: 13,
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle} htmlFor="prune-schedule">Prune schedule (cron)</label>
        <input
          id="prune-schedule"
          value={pruneSchedule}
          onChange={(e) => setPruneSchedule(e.target.value)}
          placeholder="0 2 * * *"
          disabled={isPending}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="gc-schedule">GC schedule (cron)</label>
        <input
          id="gc-schedule"
          value={gcSchedule}
          onChange={(e) => setGcSchedule(e.target.value)}
          placeholder="0 3 * * 0"
          disabled={isPending}
          style={inputStyle}
        />
      </div>
      {error && (
        <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--err)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="primary" size="sm" onClick={onSave} disabled={!dirty || isPending}>
          {isPending ? 'Saving…' : 'Save schedules'}
        </Button>
        {savedAt && !dirty && (
          <span style={{ fontSize: 11, color: 'var(--ok)' }}>✓ Saved</span>
        )}
      </div>
    </div>
  )
}
