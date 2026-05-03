'use client'

import { useState } from 'react'

interface CopyButtonProps {
  text: string
  style?: React.CSSProperties
}

export function CopyButton({ text, style }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => flash(),
        () => fallback(),
      )
    } else {
      fallback()
    }
  }

  function fallback() {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    try { document.execCommand('copy'); flash() } catch {}
    document.body.removeChild(el)
  }

  function flash() {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        fontSize: 11, padding: '2px 8px', cursor: 'pointer',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--surf2)', color: 'var(--fg-dim)',
        flexShrink: 0,
        ...style,
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
