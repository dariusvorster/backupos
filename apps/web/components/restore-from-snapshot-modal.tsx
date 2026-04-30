'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { History, Database, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'
import { restoreFromSnapshot } from '@/app/actions/restore'

interface Props {
  snapshotId:    string
  snapshotPaths: string[]
  triggerLabel?: string
}

const DB_PATH_HINTS = [
  '.sql', '.dump', '.rdb', '.bson',
  'mongodump', 'pg_dump',
  '/var/lib/postgresql', '/var/lib/mysql', '/var/lib/mongodb', '/var/lib/redis',
]

function looksLikeDatabaseSnapshot(paths: string[]): boolean {
  return paths.some(p => DB_PATH_HINTS.some(hint => p.toLowerCase().includes(hint)))
}

export function RestoreFromSnapshotButton({ snapshotId, snapshotPaths, triggerLabel = 'Restore' }: Props) {
  const [open, setOpen] = useState(false)
  const [sourcePath, setSourcePath] = useState(snapshotPaths[0] ?? '/')
  const [targetType, setTargetType] = useState<'temp' | 'inplace' | 'custom'>('temp')
  const [customPath, setCustomPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isDb = looksLikeDatabaseSnapshot(snapshotPaths)

  function close() {
    setOpen(false)
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await restoreFromSnapshot({
        snapshotId,
        sourcePath,
        targetType,
        customPath: targetType === 'custom' ? customPath : undefined,
      })
      if (result.ok) {
        router.push('/restore/runs')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          background: 'none', color: 'var(--fg)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <History size={12} />
        {triggerLabel}
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '28px 32px',
              width: 520, maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <History size={18} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Restore from snapshot</div>
                <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{snapshotId}</div>
              </div>
              <button
                onClick={close}
                style={{ fontSize: 18, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >
                <X size={16} />
              </button>
            </div>

            {isDb && (
              <div style={{
                marginBottom: 20, padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, var(--warn) 10%)',
                border: '1px solid var(--warn)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <Database size={14} color="var(--warn)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                  This looks like a database snapshot. The ad-hoc restore below performs a raw filesystem
                  restore only — for proper database recovery (with engine-aware handling),{' '}
                  <Link href={`/restore/new?fromSnapshot=${snapshotId}`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                    use the database restore wizard
                  </Link>.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', display: 'block', marginBottom: 4 }}>
                  Source path inside snapshot
                </label>
                <select
                  value={sourcePath}
                  onChange={e => setSourcePath(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 10px', fontSize: 13,
                    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {snapshotPaths.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', display: 'block', marginBottom: 4 }}>
                  Target
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { v: 'temp',    label: 'Temp directory', hint: 'Restore to /tmp/backupos-restore-<id> for inspection' },
                    { v: 'inplace', label: 'In-place',       hint: 'Restore to the original path (overwrites existing files)' },
                    { v: 'custom',  label: 'Custom path',    hint: 'Specify an absolute path' },
                  ] as const).map(opt => (
                    <label
                      key={opt.v}
                      style={{
                        display: 'flex', gap: 8, padding: '8px 10px',
                        border: `1px solid ${targetType === opt.v ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        backgroundColor: targetType === opt.v ? 'color-mix(in srgb, var(--surf) 70%, var(--accent) 10%)' : 'var(--surf)',
                      }}
                    >
                      <input
                        type="radio"
                        name="targetType"
                        value={opt.v}
                        checked={targetType === opt.v}
                        onChange={() => setTargetType(opt.v)}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{opt.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {targetType === 'custom' && (
                <div>
                  <input
                    type="text"
                    placeholder="/var/restore/example"
                    value={customPath}
                    onChange={e => setCustomPath(e.target.value)}
                    style={{
                      width: '100%', padding: '6px 10px', fontSize: 13,
                      backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              )}
            </div>

            {error && (
              <div style={{
                marginTop: 16, padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--err-dim)',
                border: '1px solid var(--err)',
                fontSize: 12, color: 'var(--err)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertTriangle size={12} />
                {error}
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={close}
                disabled={isPending}
                style={{
                  padding: '6px 14px', fontSize: 13, cursor: isPending ? 'not-allowed' : 'pointer',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  background: 'none', color: 'var(--fg)',
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={isPending || (targetType === 'custom' && !customPath)}
                style={{
                  padding: '6px 14px', fontSize: 13, cursor: isPending ? 'not-allowed' : 'pointer',
                  borderRadius: 'var(--radius-sm)', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-fg)',
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                {isPending ? 'Starting…' : 'Restore now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
