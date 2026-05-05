'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { getJobComposeProjectName, getLatestRunForJob } from '@/app/actions/restore'
import { triggerComposeRestore } from '@/app/actions/compose-restore'
import { StepIndicator, WizardCard, WizardNav, escHtml } from '@/components/dr/restore-file-wizard'

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreHostWizard({ jobs, onDone }: Props) {
  const [step, setStep]             = useState(0)
  const [jobId, setJobId]           = useState('')
  const [projectName, setProjectName]     = useState('')
  const [latestRunId, setLatestRunId]     = useState('')
  const [latestRunDate, setLatestRunDate] = useState<Date | null>(null)
  const [confirmText, setConfirmText]     = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    setError(null)
    setProjectName('')
    setLatestRunId('')
    setLatestRunDate(null)

    Promise.all([
      getJobComposeProjectName(jobId),
      getLatestRunForJob(jobId),
    ]).then(([nameResult, runResult]) => {
      if (!nameResult.ok) {
        setError(nameResult.error)
      } else {
        setProjectName(nameResult.projectName)
      }
      if (!runResult.ok) {
        setError(prev => prev ? `${prev}; ${runResult.error}` : runResult.error)
      } else {
        setLatestRunId(runResult.runId)
        setLatestRunDate(runResult.createdAt)
      }
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load job details')
    }).finally(() => {
      setLoading(false)
    })
  }, [jobId])

  async function execute() {
    setSubmitting(true)
    setError(null)
    try {
      if (confirmText !== projectName) {
        setError(`Type the project name "${projectName}" to confirm.`)
        setSubmitting(false)
        return
      }
      const fd = new FormData()
      fd.set('jobId',                jobId)
      fd.set('sourceRunId',          latestRunId)
      fd.set('mode',                 'in_place')
      fd.set('restoreComposeFile',   '1')
      fd.set('confirmedProjectName', projectName)
      try {
        await triggerComposeRestore(fd)
      } catch (err) {
        const isRedirect = err && typeof err === 'object' && 'digest' in err
          && typeof (err as { digest?: string }).digest === 'string'
          && (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
        if (!isRedirect) throw err
      }
      await logDrAction({
        action:   'restore_host',
        jobId,
        target:   projectName,
        dryRun:   false,
        metadata: { sourceRunId: latestRunId, projectName, mode: 'in_place' },
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — Compose Stack Restore — ${escHtml(jobName)}</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    p, li { font-size: 14px; line-height: 1.6; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    .danger { color: #cc0000; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Disaster Recovery Runbook</h1>
  <p><strong>Type:</strong> Docker-Compose Stack Restore (in-place)</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Project:</strong> <code>${escHtml(projectName)}</code></p>
  <p><strong>Source run:</strong> <code>${escHtml(latestRunId)}</code>${latestRunDate ? ` (${latestRunDate.toISOString()})` : ''}</p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>WARNING</h2>
  <p class="danger">In-place restore stops all containers in the compose project, overwrites volumes, and restarts. The project will be UNAVAILABLE during the restore.</p>
  <h2>Steps</h2>
  <ol>
    <li>Ensure the BackupOS agent for job <strong>${escHtml(jobName)}</strong> is connected and reachable.</li>
    <li>Confirm the compose project <code>${escHtml(projectName)}</code> is the correct target.</li>
    <li>In BackupOS DR Mode, open "Restore a compose stack" and select the job.</li>
    <li>Verify the latest successful backup run is the one shown (run ID: <code>${escHtml(latestRunId)}</code>).</li>
    <li>Type the project name to confirm: <code>${escHtml(projectName)}</code></li>
    <li>Click "Execute restore". BackupOS will stop the stack, restore volumes from the backup run, and restart.</li>
    <li>Monitor agent logs for progress. Do not interrupt the restore.</li>
  </ol>
  <h2>Verification</h2>
  <p>After the restore completes, verify containers are running (<code>docker compose ps</code>), check application health endpoints, and confirm data integrity before routing production traffic.</p>
  <h2>Rollback</h2>
  <p>If the restore fails, the compose project may be in a stopped state. Check agent logs for the failure point, then either re-run the restore or start the stack manually from a known-good image.</p>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url)
    if (win) {
      win.onload = () => {
        win.print()
        URL.revokeObjectURL(url)
      }
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
          The compose stack restore has been queued. Monitor progress in the agent logs.
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
      <StepIndicator current={step} labels={['Job', 'Confirm']} />

      {step === 0 && (
        <WizardCard title="Which compose stack should we restore?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 8 }}>Loading job details…</div>
          )}
          {error && !loading && (
            <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 8 }}>{error}</div>
          )}
          {jobId && !loading && !error && projectName && (
            <div style={{
              marginTop: 12,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
            }}>
              <div>Project: <span style={{ color: 'var(--fg)' }}>{projectName}</span></div>
              {latestRunDate && (
                <div>Latest run: <span style={{ color: 'var(--fg)' }}>{latestRunDate.toLocaleString()}</span></div>
              )}
            </div>
          )}
          <WizardNav
            onBack={onDone}
            backLabel="Cancel"
            onNext={() => { setError(null); setStep(1) }}
            nextDisabled={!jobId || loading || !!error || !projectName || !latestRunId}
          />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="Final confirmation — this cannot be undone">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Project: <span style={{ color: 'var(--fg)' }}>{projectName}</span></div>
            <div>Source run: <span style={{ color: 'var(--fg)' }}>{latestRunId.slice(0, 8)}…</span>
              {latestRunDate && <span style={{ color: 'var(--fg-dim)' }}> ({latestRunDate.toLocaleString()})</span>}
            </div>
            <div>Mode: <span style={{ color: 'var(--fg)' }}>in_place</span></div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            backgroundColor: 'var(--err-dim)',
            border: '1px solid color-mix(in srgb, var(--err) 30%, transparent)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="var(--err)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--err)' }}>
              In-place restore will <strong>stop all containers</strong> in the <code style={{ fontSize: 11 }}>{projectName}</code> stack, overwrite volumes from backup, then restart. The stack will be unavailable during the restore.
            </span>
          </div>

          <label style={labelStyle}>Type <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{projectName}</code> to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={projectName}
            style={inputStyle}
            autoFocus
          />

          {error && (
            <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 8 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              onClick={() => { setError(null); setConfirmText(''); setStep(0) }}
              style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}
            >
              Back
            </button>
            <button
              onClick={execute}
              disabled={submitting || confirmText !== projectName}
              style={{
                padding: '8px 20px', fontSize: 13,
                cursor: (submitting || confirmText !== projectName) ? 'not-allowed' : 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--err)', color: '#fff',
                opacity: (submitting || confirmText !== projectName) ? 0.4 : 1,
              }}
            >
              {submitting ? 'Initiating…' : 'Execute compose restore'}
            </button>
          </div>
        </WizardCard>
      )}
    </div>
  )
}
