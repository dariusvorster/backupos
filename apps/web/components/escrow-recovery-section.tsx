'use client'

import { useState, useTransition } from 'react'
import { recoverPassword } from '@/app/actions/escrow'
import { Eye, EyeOff } from 'lucide-react'

interface EscrowedRepo {
  id:   string
  name: string
}

export function EscrowRecoverySection({ repos }: { repos: EscrowedRepo[] }) {
  const [selectedId, setSelectedId]    = useState(repos[0]?.id ?? '')
  const [passphrase,  setPassphrase]   = useState('')
  const [revealed,    setRevealed]     = useState<string | null>(null)
  const [showPwd,     setShowPwd]      = useState(false)
  const [error,       setError]        = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  if (repos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
        No repositories have escrow configured. Enable it from a repository detail page.
      </p>
    )
  }

  function handleRecover() {
    setError(null)
    setRevealed(null)
    const fd = new FormData()
    fd.set('passphrase', passphrase)
    startTransition(async () => {
      const result = await recoverPassword(selectedId, fd)
      if (result.error) { setError(result.error); return }
      setRevealed(result.password ?? null)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Repository</label>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setRevealed(null); setError(null) }}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)' }}
        >
          {repos.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Recovery passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={e => { setPassphrase(e.target.value); setRevealed(null); setError(null) }}
          placeholder="Enter your recovery passphrase"
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{error}</p>
      )}

      {revealed ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', border: '1px solid var(--border)',
        }}>
          <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', filter: showPwd ? 'none' : 'blur(4px)', userSelect: showPwd ? ('text' as const) : ('none' as const) }}>
            {revealed}
          </code>
          <button
            onClick={() => setShowPwd(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-mute)', padding: 2, display: 'flex' }}
          >
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      ) : (
        <button
          onClick={handleRecover}
          disabled={isPending || !passphrase}
          style={{
            fontSize: 13, padding: '7px 16px', cursor: isPending ? 'wait' : 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start',
            opacity: !passphrase ? 0.5 : 1,
          }}
        >
          {isPending ? 'Decrypting…' : 'Recover password'}
        </button>
      )}
    </div>
  )
}
