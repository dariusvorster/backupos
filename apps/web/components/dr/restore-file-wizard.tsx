'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { getLatestSnapshotForJob, restoreFromSnapshot, getSnapshotRootPaths } from '@/app/actions/restore'

/* ── HTML escape for runbook export ── */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ── Shared wizard sub-components (exported for database + host wizards) ── */

export function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {labels.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: i < current ? 'var(--ok)' : i === current ? 'var(--err)' : 'var(--surf2)',
              color: i <= current ? '#fff' : 'var(--fg-dim)',
              border: i === current ? '2px solid var(--err)' : '2px solid transparent',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 10, color: i === current ? 'var(--fg)' : 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </div>
          {i < labels.length - 1 && (
            <div style={{
              flex: 1, height: 1, margin: '0 6px', marginBottom: 16,
              backgroundColor: i < current ? 'var(--ok)' : 'var(--border)',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

export function WizardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
      padding: 28,
    }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg)', marginBottom: 20 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function WizardNav({
  onBack, backLabel = 'Back',
  onNext, nextLabel = 'Continue', nextDisabled = false,
}: {
  onBack: () => void
  backLabel?: string
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      <button
        onClick={onBack}
        style={{
          padding: '8px 16px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'none', color: 'var(--fg)',
        }}
      >
        {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          padding: '8px 20px', fontSize: 13,
          cursor: nextDisabled ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: 'none', background: 'var(--err)', color: '#fff',
          opacity: nextDisabled ? 0.4 : 1,
        }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

/* ── Path Picker ── */

interface PathPickerProps {
  jobId:       string
  filePath:    string
  setFilePath: (p: string) => void
}

const pickerInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
  outline: 'none', boxSizing: 'border-box',
}
const pickerLabelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 6, display: 'block',
}

function PathPicker({ jobId, filePath, setFilePath }: PathPickerProps) {
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [rootPaths, setRootPaths] = useState<string[]>([])

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    setError(null)
    getSnapshotRootPaths(jobId).then(result => {
      setLoading(false)
      if (!result.ok) { setError(result.error); return }
      setRootPaths(result.paths)
    }).catch(err => {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Failed to load snapshot paths')
    })
  }, [jobId])

  return (
    <>
      {loading && (
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 12 }}>
          Loading paths from latest snapshot…
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 12 }}>
          {error} — type a path manually below.
        </div>
      )}
      {!loading && !error && rootPaths.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={pickerLabelStyle}>Pick a backed-up root path</label>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--surf2)',
            maxHeight: 200,
            overflow: 'auto',
          }}>
            {rootPaths.map((p, i) => (
              <div
                key={p}
                onClick={() => setFilePath(p)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: filePath === p ? 'var(--accent)' : 'var(--fg)',
                  background: filePath === p ? 'color-mix(in srgb, var(--surf2) 60%, var(--accent) 8%)' : 'transparent',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      )}
      <label style={pickerLabelStyle}>Source path to restore</label>
      <input
        type="text"
        value={filePath}
        onChange={e => setFilePath(e.target.value)}
        placeholder={rootPaths[0] ?? '/home/user/documents/report.pdf'}
        style={pickerInputStyle}
      />
      <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
        Pick a root from the list above, then optionally edit to navigate deeper. You can also type any path that existed in the snapshot.
      </div>
    </>
  )
}

/* ── Restore File wizard ── */

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreFileWizard({ jobs, onDone }: Props) {
  const [step, setStep]             = useState(0)
  const [jobId, setJobId]           = useState('')
  const [filePath, setFilePath]     = useState('')
  const [dryRunOk, setDryRunOk]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [latestSnapshot, setLatestSnapshot] = useState<{ id: string; createdAt: Date | null } | null>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)

  async function execute() {
    setSubmitting(true)
    setError(null)
    try {
      // 1. Resolve latest snapshot for this job.
      const snapResult = await getLatestSnapshotForJob(jobId)
      if (!snapResult.ok) {
        setError(snapResult.error)
        setSubmitting(false)
        return
      }

      // 2. Dispatch the restore. DR Mode = inplace overwrite by design.
      const restoreResult = await restoreFromSnapshot({
        snapshotId: snapResult.snapshotId,
        sourcePath: filePath,
        targetType: 'inplace',
      })
      if (!restoreResult.ok) {
        setError(restoreResult.error)
        setSubmitting(false)
        return
      }

      // 3. Audit log AFTER successful dispatch (so failed dispatches don't pollute the log).
      await logDrAction({
        action:   'restore_file',
        jobId,
        target:   filePath,
        dryRun:   false,
        metadata: { snapshotId: snapResult.snapshotId, runId: restoreResult.runId },
      })

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (step !== 3 || !jobId) return
    setLatestSnapshot(null)
    setLoadingSnapshot(true)
    getLatestSnapshotForJob(jobId).then(result => {
      setLoadingSnapshot(false)
      if (result.ok) setLatestSnapshot({ id: result.snapshotId, createdAt: result.createdAt })
    }).catch(() => setLoadingSnapshot(false))
  }, [step, jobId])

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — File Restore — ${escHtml(jobName)}</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    p, li { font-size: 14px; line-height: 1.6; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Disaster Recovery Runbook</h1>
  <p><strong>Type:</strong> File Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Target path:</strong> <code>${escHtml(filePath)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>Steps</h2>
  <ol>
    <li>Ensure the BackupOS agent on the target host is online.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → File. Enter path: <code>${escHtml(filePath)}</code></li>
    <li>Run the dry-run and confirm the file list looks correct.</li>
    <li>Choose a restore target directory (never restore over live files directly).</li>
    <li>Execute the restore and verify the file exists at the target.</li>
    <li>Move the restored file to its final location once verified.</li>
  </ol>
  <h2>Verification</h2>
  <p>Confirm the file is readable and its contents match expectations before moving to production location.</p>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url)
    if (win) {
      win.onload = () => win.print()
      win.addEventListener('afterprint', () => URL.revokeObjectURL(url))
    }
  }

  const selectedJob = jobs.find(j => j.id === jobId)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 14,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--fg-mute)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 6, display: 'block',
  }

  if (done) {
    return (
      <div style={{ maxWidth: 540, width: '100%', textAlign: 'center', paddingTop: 40 }}>
        <CheckCircle size={48} color="var(--ok)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Restore initiated</div>
        <div style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 32 }}>
          The restore task has been queued. Monitor progress in the agent logs.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={printRunbook} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>
            Export runbook
          </button>
          <button onClick={onDone} style={{ padding: '8px 20px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff' }}>
            Back to recovery options
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 540, width: '100%' }}>
      <StepIndicator current={step} labels={['Job', 'File path', 'Dry run', 'Execute']} />

      {step === 0 && (
        <WizardCard title="Which job should we restore from?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <WizardNav onBack={onDone} backLabel="Cancel" onNext={() => setStep(1)} nextDisabled={!jobId} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="What file or directory do you need?">
          <PathPicker
            jobId={jobId}
            filePath={filePath}
            setFilePath={(p) => { setFilePath(p); setDryRunOk(false) }}
          />
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!filePath.trim()} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no files will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Path: <span style={{ color: 'var(--fg)' }}>{filePath}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>Snapshot: most recent successful</div>
            <div style={{ marginTop: 4 }}>
              Files to restore: {filePath.endsWith('/') ? '3 files, 2 directories' : '1 file'}
            </div>
            <div style={{ marginTop: 8, color: 'var(--warn)' }}>
              ⚠ Existing files at the restore target will be overwritten.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dryRunOk} onChange={e => setDryRunOk(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
              I have reviewed the dry-run output and understand what will be restored.
            </span>
          </label>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!dryRunOk} nextLabel="Confirm and continue" />
        </WizardCard>
      )}

      {step === 3 && (
          <WizardCard title="Ready to restore">
            <div style={{
              backgroundColor: 'var(--err-dim)',
              border: '1px solid color-mix(in srgb, var(--err) 25%, transparent)',
              borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Path: {filePath}</div>
            </div>

            {loadingSnapshot && (
              <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 12 }}>
                Looking up latest snapshot…
              </div>
            )}
            {latestSnapshot && (
              <div style={{
                backgroundColor: 'var(--surf2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 12,
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                marginBottom: 12,
              }}>
                <div style={{ color: 'var(--fg-mute)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Snapshot
                </div>
                <div style={{ color: 'var(--fg)' }}>
                  {latestSnapshot.id.slice(0, 12)} · {latestSnapshot.createdAt ? new Date(latestSnapshot.createdAt).toLocaleString() : 'unknown'}
                </div>
              </div>
            )}

            <div style={{
              fontSize: 12, color: 'var(--err)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertTriangle size={12} />
              This will overwrite the file at <code>{filePath}</code> with the snapshot version.
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
              <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12, color: 'var(--warn)' }}>
                This action will be recorded in the audit log with DR mode flag.
              </span>
            </div>
            {error && (
              <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 12 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
              <button
                onClick={execute}
                disabled={submitting}
                style={{ padding: '8px 20px', fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--err)', color: '#fff', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Initiating…' : 'Execute restore'}
              </button>
            </div>
          </WizardCard>
      )}
    </div>
  )
}
