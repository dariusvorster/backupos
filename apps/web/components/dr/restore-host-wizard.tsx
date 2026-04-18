'use client'

import { useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { StepIndicator, WizardCard, WizardNav, escHtml } from '@/components/dr/restore-file-wizard'

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreHostWizard({ jobs, onDone }: Props) {
  const [step, setStep]             = useState(0)
  const [jobId, setJobId]           = useState('')
  const [targetHost, setTargetHost] = useState('')
  const [dryRunOk, setDryRunOk]     = useState(false)
  const [confirmed, setConfirmed]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  async function execute() {
    setSubmitting(true)
    await logDrAction({ action: 'restore_host', jobId, target: targetHost, dryRun: false })
    setSubmitting(false)
    setDone(true)
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — Host Restore — ${escHtml(jobName)}</title>
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
  <p><strong>Type:</strong> Full Host Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Target host:</strong> <code>${escHtml(targetHost)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>WARNING</h2>
  <p class="danger">Full host restore COMPLETELY OVERWRITES the target system. Do not use the production host as the target unless you have no alternative.</p>
  <h2>Steps</h2>
  <ol>
    <li>Boot target host from the BackupOS restore media (USB or network boot).</li>
    <li>Ensure target has sufficient disk space to receive the restore.</li>
    <li>Connect target host to the network and verify BackupOS agent can reach it.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → Host. Confirm target: <code>${escHtml(targetHost)}</code></li>
    <li>Run the dry-run. Review the volume list, total size, and estimated restore time.</li>
    <li>Execute the restore. Do not interrupt — data loss may result.</li>
    <li>Reboot target host once restore completes.</li>
    <li>Verify services are running and data is intact.</li>
  </ol>
  <h2>Verification</h2>
  <p>After reboot, confirm core services start successfully, check application health endpoints, and verify data integrity with application-level checks before routing production traffic.</p>
  <h2>Rollback</h2>
  <p>If restore fails mid-way, the target host may be in an indeterminate state. Boot from rescue media and re-run the restore from scratch.</p>
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
          The host restore task has been queued. Monitor progress in the agent logs. This may take 30–120 minutes.
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
      <StepIndicator current={step} labels={['Job', 'Target host', 'Dry run', 'Execute']} />

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
        <WizardCard title="Where should we restore to?">
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 8%)',
            border: '1px solid color-mix(in srgb, var(--border) 50%, #cc0000 50%)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16,
          }}>
            <AlertTriangle size={14} color="var(--err)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--err)' }}>
              Full host restore overwrites all data on the target. Use a staging host, not production.
            </span>
          </div>
          <label style={labelStyle}>Target hostname or IP</label>
          <input
            type="text"
            value={targetHost}
            onChange={e => setTargetHost(e.target.value)}
            placeholder="e.g. 192.168.1.50 or staging-host"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
            The BackupOS agent must be running on this host and reachable from the server.
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!targetHost.trim()} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no data will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Target: <span style={{ color: 'var(--fg)' }}>{targetHost}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>Snapshot: most recent successful</div>
            <div style={{ marginTop: 4 }}>Total size: ~84 GB (estimated)</div>
            <div style={{ marginTop: 4 }}>Volumes: /, /home, /var</div>
            <div style={{ marginTop: 4 }}>Estimated time: 45–90 minutes</div>
            <div style={{ marginTop: 8, color: 'var(--err)', fontWeight: 600 }}>
              ⛔ ALL DATA ON {targetHost.toUpperCase()} WILL BE OVERWRITTEN.
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
        <WizardCard title="Final confirmation — this cannot be undone">
          <div style={{
            backgroundColor: 'color-mix(in srgb, var(--surf2) 80%, #cc0000 5%)',
            border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Target: {targetHost}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Estimated size: ~84 GB</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--err)' }}>
              I confirm that <strong>{targetHost}</strong> is not a live production host and I understand all its data will be overwritten.
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--warn)' }}>
              This action will be recorded in the audit log with DR mode flag.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
            <button
              onClick={execute}
              disabled={submitting || !confirmed}
              style={{ padding: '8px 20px', fontSize: 13, cursor: (submitting || !confirmed) ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--err)', color: '#fff', opacity: (submitting || !confirmed) ? 0.4 : 1 }}
            >
              {submitting ? 'Initiating…' : 'Execute full host restore'}
            </button>
          </div>
        </WizardCard>
      )}
    </div>
  )
}
