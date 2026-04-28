'use client'

import { useRef } from 'react'
import { Avatar } from '@/components/avatar'

interface Props {
  src:          string | null
  name:         string
  uploadAction: (fd: FormData) => Promise<void>
  removeAction: () => Promise<void>
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
  color: 'var(--fg)', backgroundColor: 'var(--surf2)',
}

export function AvatarUpload({ src, name, uploadAction, removeAction }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef  = useRef<HTMLFormElement>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <Avatar src={src} name={name} size={80} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <form ref={formRef} action={uploadAction}>
          <input
            ref={inputRef}
            name="avatar"
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
            onChange={() => formRef.current?.requestSubmit()}
          />
          <button type="button" style={btnStyle} onClick={() => inputRef.current?.click()}>
            Upload image
          </button>
        </form>
        <form action={removeAction}>
          <button type="submit" style={{ ...btnStyle, color: 'var(--fg-mute)', backgroundColor: 'transparent' }}>
            Remove
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Self-hosted: stored locally. Max 1 MB, JPG/PNG/WebP.</p>
      </div>
    </div>
  )
}
