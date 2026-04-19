'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Loader, ShieldCheck } from 'lucide-react'
import { runPreflight } from '@/app/actions/preflight'
import { CHECKS_SKELETON, type CheckResult, type CheckStatus } from '@/lib/preflight'

interface Props {
  jobId:   string
  jobName: string
}

function StatusIcon({ status, spinning }: { status: CheckStatus | 'pending'; spinning?: boolean }) {
  if (spinning) return <Loader size={16} color="var(--fg-dim)" style={{ animation: 'spin 1s linear infinite' }} />
  if (status === 'ok')      return <CheckCircle   size={16} color="var(--ok)" />
  if (status === 'warning') return <AlertTriangle size={16} color="var(--warn)" />
  if (status === 'failed')  return <XCircle       size={16} color="var(--err)" />
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)' }} />
}

export function PreflightButton({ jobId, jobName }: Props) {
  const [open,    setOpen]    = useState(false)
  const [results, setResults] = useState<CheckResult[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    if (isPending) return
    setOpen(true)
    setResults(null)
    setError(null)
    startTransition(async () => {
      try {
        const r = await runPreflight(jobId)
        setResults(r)
      } catch {
        setError('Pre-flight check failed to run. Please try again.')
      }
    })
  }

  function closeModal() {
    setOpen(false)
    setResults(null)
  }

  const overall: CheckStatus | null = results
    ? results.some(r => r.status === 'failed')  ? 'failed'
    : results.some(r => r.status === 'warning') ? 'warning'
    : 'ok'
    : null

  return (
    <>
      <button
        onClick={openModal}
        style={{
          padding: '6px 14px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'none', color: 'var(--fg)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <ShieldCheck size={14} />
        Pre-flight
      </button>

      {open && (
        <div
          onClick={closeModal}
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
              width: 500,
              maxWidth: '90vw',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <ShieldCheck size={18} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Pre-flight check</div>
                <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{jobName}</div>
              </div>
              <button
                onClick={closeModal}
                style={{ fontSize: 18, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CHECKS_SKELETON.map(skeleton => {
                const result  = results?.find(r => r.id === skeleton.id)
                const isRunning = isPending && !result
                return (
                  <div key={skeleton.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ marginTop: 1, flexShrink: 0 }}>
                      <StatusIcon status={result?.status ?? 'pending'} spinning={isRunning} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{skeleton.label}</div>
                      {result && (
                        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>{result.detail}</div>
                      )}
                      {isRunning && (
                        <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>Checking…</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {error && (
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--err)', textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* Summary */}
            {overall && (
              <div style={{
                marginTop: 20, padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  overall === 'ok'      ? 'color-mix(in srgb, var(--surf2) 80%, var(--ok) 10%)'   :
                  overall === 'warning' ? 'color-mix(in srgb, var(--surf2) 80%, var(--warn) 10%)' :
                                         'color-mix(in srgb, var(--surf2) 80%, var(--err) 10%)',
                border: `1px solid ${overall === 'ok' ? 'var(--ok)' : overall === 'warning' ? 'var(--warn)' : 'var(--err)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <StatusIcon status={overall} />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                  {overall === 'ok'      && 'All checks passed — job is ready to run.'}
                  {overall === 'warning' && 'Warnings detected — review before running.'}
                  {overall === 'failed'  && 'One or more checks failed — resolve before running.'}
                </span>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {!isPending && (results || error) && (
                <button
                  onClick={openModal}
                  style={{
                    padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'none', color: 'var(--fg)',
                  }}
                >
                  Re-run
                </button>
              )}
              <button
                onClick={closeModal}
                style={{
                  padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)', border: 'none',
                  background: 'var(--accent)', color: '#fff',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
