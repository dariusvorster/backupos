'use client'

import { useState, useTransition } from 'react'
import { Copy, Check } from 'lucide-react'
import { getResticCommand } from '@/app/actions/runs'

export function CopyCommandButton({ runId }: { runId: string }) {
  const [copied,    setCopied]       = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCopy() {
    if (isPending || copied) return
    startTransition(async () => {
      const cmd = await getResticCommand(runId)
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      disabled={isPending}
      title="Copy restic command"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, padding: '5px 12px',
        cursor: isPending ? 'wait' : 'pointer',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        color: copied ? 'var(--ok)' : 'var(--fg-mute)',
        background: 'var(--surf)',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy command'}
    </button>
  )
}
