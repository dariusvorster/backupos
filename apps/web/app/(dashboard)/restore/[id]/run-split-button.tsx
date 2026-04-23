'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { runSpec, runSpecWithSnapshot, getSnapshots, getRepositories } from '@/app/actions/restore'

interface Snapshot {
  id: string
  createdAt: Date | null
  sizeBytes: number | null
}

interface Repo {
  id: string
  name: string
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

export function RunSplitButton({
  specId,
  repositoryId,
}: {
  specId: string
  repositoryId: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [dropOpen, setDropOpen]       = useState(false)
  const [modalOpen, setModalOpen]     = useState(false)

  // Picker state
  const [repos, setRepos]                   = useState<Repo[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(repositoryId)
  const [snaps, setSnaps]                   = useState<Snapshot[]>([])
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null)
  const [loadingSnaps, setLoadingSnaps]     = useState(false)
  const [loadError, setLoadError]           = useState<string | null>(null)
  const [runError, setRunError]             = useState<string | null>(null)

  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  function loadSnapsForRepo(repoId: string) {
    setLoadingSnaps(true)
    setLoadError(null)
    setSnaps([])
    setSelectedSnapId(null)
    getSnapshots(repoId)
      .then(data => { setSnaps(data); setLoadingSnaps(false) })
      .catch(() => { setLoadError('Failed to load snapshots.'); setLoadingSnaps(false) })
  }

  function openModal() {
    setDropOpen(false)
    setModalOpen(true)
    setRunError(null)
    setSelectedSnapId(null)
    setSnaps([])
    setLoadError(null)
    if (repositoryId) {
      setSelectedRepoId(repositoryId)
      loadSnapsForRepo(repositoryId)
    } else {
      setSelectedRepoId(null)
      setRepos([])
      getRepositories().then(r => setRepos(r)).catch(() => setRepos([]))
    }
  }

  function handleRepoSelect(repoId: string) {
    setSelectedRepoId(repoId)
    loadSnapsForRepo(repoId)
  }

  function handleRun() {
    if (!selectedSnapId) return
    setRunError(null)
    startTransition(async () => {
      const result = await runSpecWithSnapshot(specId, selectedSnapId)
      if (result && 'error' in result) setRunError(result.error)
    })
  }

  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none',
    padding: '7px 14px', lineHeight: 1,
  }

  return (
    <>
      {/* Split button */}
      <div ref={dropRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          disabled={isPending}
          onClick={() => startTransition(() => runSpec(specId))}
          style={{
            ...btnBase,
            backgroundColor: 'var(--accent)',
            color: '#000',
            borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
            borderRight: '1px solid color-mix(in srgb, var(--accent) 70%, #000 30%)',
          }}
        >
          {isPending ? 'Starting…' : 'Run now'}
        </button>
        <button
          disabled={isPending}
          onClick={() => setDropOpen(o => !o)}
          aria-label="More run options"
          style={{
            ...btnBase,
            backgroundColor: 'color-mix(in srgb, var(--accent) 20%, var(--surf) 80%)',
            color: 'var(--accent)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            padding: '7px 10px',
          }}
        >
          ▾
        </button>

        {dropOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            minWidth: 180, zIndex: 50,
          }}>
            <button
              onClick={() => { setDropOpen(false); startTransition(() => runSpec(specId)) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, color: 'var(--fg)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              Run with latest
            </button>
            <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
            <button
              onClick={openModal}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, color: 'var(--fg)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              Choose snapshot…
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', width: '100%', maxWidth: 480,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>Choose snapshot</span>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            {/* Repo selector — only shown when no repositoryId AND repo not yet chosen */}
            {!repositoryId && !selectedRepoId && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 6 }}>
                  Repository
                </label>
                <select
                  style={{
                    width: '100%', backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, padding: '7px 10px',
                  }}
                  defaultValue=""
                  onChange={e => { if (e.target.value) handleRepoSelect(e.target.value) }}
                >
                  <option value="" disabled>Select a repository…</option>
                  {repos.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Snapshot list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {loadingSnaps && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--fg-mute)', textAlign: 'center' }}>
                  Loading…
                </div>
              )}
              {loadError && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--err)', textAlign: 'center' }}>
                  {loadError}{' '}
                  <button
                    onClick={() => selectedRepoId && loadSnapsForRepo(selectedRepoId)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loadingSnaps && !loadError && selectedRepoId && snaps.length === 0 && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--fg-mute)', textAlign: 'center' }}>
                  No snapshots found in this repository.
                </div>
              )}
              {snaps.map(snap => (
                <button
                  key={snap.id}
                  onClick={() => setSelectedSnapId(snap.id)}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left',
                    alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    backgroundColor: selectedSnapId === snap.id ? 'var(--surf2)' : 'transparent',
                    borderLeft: `3px solid ${selectedSnapId === snap.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>
                    {snap.id.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                    {snap.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                    {' · '}
                    {formatBytes(snap.sizeBytes)}
                  </span>
                </button>
              ))}
            </div>

            {/* Run error */}
            {runError && (
              <div style={{
                padding: '8px 20px', fontSize: 12, color: 'var(--err)',
                borderTop: '1px solid var(--border)',
              }}>
                {runError}
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
                }}
              >
                Cancel
              </button>
              <button
                disabled={!selectedSnapId || isPending}
                onClick={handleRun}
                style={{
                  padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  backgroundColor: selectedSnapId ? 'var(--accent)' : 'var(--surf2)',
                  color: selectedSnapId ? '#000' : 'var(--fg-dim)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  opacity: (!selectedSnapId || isPending) ? 0.6 : 1,
                }}
              >
                {isPending ? 'Starting…' : 'Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
