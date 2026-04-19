'use client'

import { useState, useTransition } from 'react'
import { Pin, PinOff, Tag, Lock, Unlock } from 'lucide-react'
import { pinSnapshot, addCustomTag, removeCustomTag, setRetentionHold, clearRetentionHold } from '@/app/actions/snapshots'

interface Props {
  id:            string
  pinned:        boolean | null
  retentionHold: boolean | null
  holdReason:    string | null
  holdExpiresAt: Date | null
  customTags:    string[]
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', fontSize: 11, cursor: 'pointer',
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
  background: 'none', color: 'var(--fg-mute)',
}

export function SnapshotActions({ id, pinned: initialPinned, retentionHold: initialHold, holdReason: initialReason, holdExpiresAt: initialExpiry, customTags: initialTags }: Props) {
  const [pinned,        setPinned]        = useState(initialPinned ?? false)
  const [hold,          setHold]          = useState(initialHold   ?? false)
  const [holdReason,    setHoldReason]    = useState(initialReason ?? '')
  const [holdExpiresAt, setHoldExpiresAt] = useState(initialExpiry ? initialExpiry.toISOString().split('T')[0] : '')
  const [customTags,    setCustomTags]    = useState(initialTags)
  const [tagInput,      setTagInput]      = useState('')
  const [showHoldForm,  setShowHoldForm]  = useState(false)
  const [showTagForm,   setShowTagForm]   = useState(false)
  const [isPending,     startTransition]  = useTransition()

  function togglePin() {
    const next = !pinned
    setPinned(next)
    startTransition(() => pinSnapshot(id, next))
  }

  function handleAddTag() {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    if (!t || customTags.includes(t)) { setTagInput(''); return }
    setCustomTags(prev => [...prev, t])
    setTagInput('')
    startTransition(() => addCustomTag(id, t))
  }

  function handleRemoveTag(tag: string) {
    setCustomTags(prev => prev.filter(t => t !== tag))
    startTransition(() => removeCustomTag(id, tag))
  }

  function handleSetHold() {
    const expiry = holdExpiresAt ? new Date(holdExpiresAt) : null
    setHold(true)
    setShowHoldForm(false)
    startTransition(() => setRetentionHold(id, holdReason, expiry))
  }

  function handleClearHold() {
    setHold(false)
    setHoldReason('')
    setHoldExpiresAt('')
    startTransition(() => clearRetentionHold(id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Tag chips */}
      {customTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {customTags.map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '1px 6px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 3, color: 'var(--fg-mute)',
            }}>
              {t}
              <button
                onClick={() => handleRemoveTag(t)}
                style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={togglePin} disabled={isPending} style={{ ...btnBase, color: pinned ? 'var(--accent)' : 'var(--fg-mute)', borderColor: pinned ? 'var(--accent)' : 'var(--border)', opacity: isPending ? 0.5 : 1 }}>
          {pinned ? <PinOff size={11} /> : <Pin size={11} />}
          {pinned ? 'Unpin' : 'Pin'}
        </button>

        <button onClick={() => setShowTagForm(v => !v)} style={btnBase}>
          <Tag size={11} /> Tag
        </button>

        {!hold ? (
          <button onClick={() => setShowHoldForm(v => !v)} style={btnBase}>
            <Lock size={11} /> Hold
          </button>
        ) : (
          <button onClick={handleClearHold} style={{ ...btnBase, color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            <Unlock size={11} /> Release hold
          </button>
        )}
      </div>

      {/* Tag input form */}
      {showTagForm && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
            placeholder="tag-name"
            style={{
              padding: '3px 8px', fontSize: 12, width: 120,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          />
          <button onClick={handleAddTag} style={{ ...btnBase, color: 'var(--accent)', borderColor: 'var(--accent)' }}>Add</button>
          <button onClick={() => setShowTagForm(false)} style={btnBase}>Cancel</button>
        </div>
      )}

      {/* Hold form */}
      {showHoldForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <input
            value={holdReason}
            onChange={e => setHoldReason(e.target.value)}
            placeholder="Reason (e.g. pre-upgrade, audit)"
            style={{
              padding: '4px 8px', fontSize: 12,
              backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-mute)' }}>Hold until</label>
            <input
              type="date"
              value={holdExpiresAt}
              onChange={e => setHoldExpiresAt(e.target.value)}
              style={{
                padding: '3px 8px', fontSize: 12,
                backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>(blank = indefinite)</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleSetHold} style={{ ...btnBase, color: 'var(--warn)', borderColor: 'var(--warn)' }}>Apply hold</button>
            <button onClick={() => setShowHoldForm(false)} style={btnBase}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
