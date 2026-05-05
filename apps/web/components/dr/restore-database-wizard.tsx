// apps/web/components/dr/restore-database-wizard.tsx
'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { logDrAction } from '@/app/actions/dr-audit'
import { StepIndicator, WizardCard, WizardNav, escHtml } from '@/components/dr/restore-file-wizard'
import { getApphookServicesForJob, triggerDatabaseRestore, getLatestSnapshotForJob } from '@/app/actions/restore'
import type { ApphookService } from '@/app/actions/restore'

interface Props {
  jobs: { id: string; name: string }[]
  onDone: () => void
}

export function RestoreDatabaseWizard({ jobs, onDone }: Props) {
  const [step, setStep]                     = useState(0)
  const [jobId, setJobId]                   = useState('')
  const [serviceName, setServiceName]       = useState('')
  const [services, setServices]             = useState<ApphookService[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [dbName, setDbName]                 = useState('')
  const [dryRunOk, setDryRunOk]             = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [done, setDone]                     = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [latestSnapshot, setLatestSnapshot] = useState<{ snapshotId: string; createdAt: Date | null } | null>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)

  useEffect(() => {
    if (!jobId) { setServices([]); setServiceName(''); setDbName(''); return }
    setLoadingServices(true)
    setError(null)
    getApphookServicesForJob(jobId).then(result => {
      setLoadingServices(false)
      if (!result.ok) { setError(result.error); setServices([]); return }
      setServices(result.services)
      if (result.services.length === 1) {
        const svc = result.services[0]!
        setServiceName(svc.serviceName)
        setDbName(svc.apphookConfig.database ?? '')
      } else {
        setServiceName('')
        setDbName('')
      }
    }).catch(err => { setLoadingServices(false); setError(String(err)) })
  }, [jobId])

  useEffect(() => {
    if (step !== 2 || !jobId) return
    setLoadingSnapshot(true)
    getLatestSnapshotForJob(jobId).then(result => {
      setLoadingSnapshot(false)
      if (result.ok) setLatestSnapshot({ snapshotId: result.snapshotId, createdAt: result.createdAt })
      else setLatestSnapshot(null)
    }).catch(() => { setLoadingSnapshot(false); setLatestSnapshot(null) })
  }, [step, jobId])

  async function execute() {
    setSubmitting(true)
    setError(null)
    const result = await triggerDatabaseRestore(jobId, serviceName, dbName)
    if (!result.ok) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    await logDrAction({ action: 'restore_database', jobId, target: dbName, dryRun: false, metadata: { restoreId: result.restoreId, serviceName, dbName } })
    setSubmitting(false)
    setDone(true)
  }

  function printRunbook() {
    const jobName = jobs.find(j => j.id === jobId)?.name ?? jobId
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DR Runbook — Database Restore — ${escHtml(jobName)}</title>
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
  <p><strong>Type:</strong> Database Restore</p>
  <p><strong>Job:</strong> ${escHtml(jobName)}</p>
  <p><strong>Database:</strong> <code>${escHtml(dbName)}</code></p>
  <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
  <h2>Steps</h2>
  <ol>
    <li>Ensure the BackupOS agent on the database host is online.</li>
    <li>Stop or quiesce the target database to prevent writes during restore.</li>
    <li>In BackupOS, navigate to Jobs → <strong>${escHtml(jobName)}</strong> → Snapshots.</li>
    <li>Select the most recent successful snapshot.</li>
    <li>Click Restore → Database. Enter database name: <code>${escHtml(dbName)}</code></li>
    <li>Run the dry-run. Confirm the dump file size and timestamp look correct.</li>
    <li>Choose a restore target (use a staging database first, then cut over).</li>
    <li>Execute the restore and run <code>SELECT COUNT(*) FROM key_table</code> to verify row counts.</li>
    <li>Resume database service once verified.</li>
  </ol>
  <h2>Verification</h2>
  <p>Confirm the database is writable and row counts match your last known values before routing production traffic.</p>
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
          The database restore task has been queued. Monitor progress in the agent logs.
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
      <StepIndicator current={step} labels={['Job', 'Service', 'Database', 'Dry run', 'Execute']} />

      {error && (
        <div style={{ backgroundColor: 'var(--err-dim)', border: '1px solid color-mix(in srgb, var(--err) 25%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--err)' }}>
          {error}
        </div>
      )}

      {step === 0 && (
        <WizardCard title="Which job contains the database backup?">
          <label style={labelStyle}>Backup job</label>
          <select value={jobId} onChange={e => { setJobId(e.target.value); setError(null) }} style={inputStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <WizardNav onBack={onDone} backLabel="Cancel" onNext={() => setStep(1)} nextDisabled={!jobId || loadingServices} />
        </WizardCard>
      )}

      {step === 1 && (
        <WizardCard title="Which service database needs to be restored?">
          <label style={labelStyle}>Service</label>
          {loadingServices ? (
            <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: '8px 0' }}>Loading services…</div>
          ) : services.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: '8px 0' }}>No apphook services found for this job.</div>
          ) : (
            <select value={serviceName} onChange={e => {
              const svc = services.find(s => s.serviceName === e.target.value)
              setServiceName(e.target.value)
              setDbName(svc?.apphookConfig.database ?? '')
            }} style={inputStyle}>
              <option value="">— Select a service —</option>
              {services.map(s => <option key={s.serviceName} value={s.serviceName}>{s.serviceName} ({s.apphookType})</option>)}
            </select>
          )}
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!serviceName} />
        </WizardCard>
      )}

      {step === 2 && (
        <WizardCard title="Which database needs to be restored?">
          <label style={labelStyle}>Database name</label>
          <input
            type="text"
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            placeholder="e.g. myapp_production"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>
            Auto-filled from apphook config. Edit if you need to restore to a different database name.
          </div>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!dbName.trim()} />
        </WizardCard>
      )}

      {step === 3 && (
        <WizardCard title="What will this touch?">
          <div style={{
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--ok)', marginBottom: 4 }}>DRY RUN — no data will be written</div>
            <div>Job: <span style={{ color: 'var(--fg)' }}>{selectedJob?.name}</span></div>
            <div>Service: <span style={{ color: 'var(--fg)' }}>{serviceName}</span></div>
            <div>Database: <span style={{ color: 'var(--fg)' }}>{dbName}</span></div>
            <div style={{ marginTop: 8, color: 'var(--fg-dim)' }}>
              Snapshot: {loadingSnapshot ? 'loading…' : latestSnapshot ? (latestSnapshot.createdAt ? new Date(latestSnapshot.createdAt).toLocaleString() : latestSnapshot.snapshotId.slice(0, 8)) : 'most recent successful'}
            </div>
            {latestSnapshot && (
              <div style={{ marginTop: 2, color: 'var(--fg-dim)' }}>Snapshot ID: <span style={{ color: 'var(--fg)' }}>{latestSnapshot.snapshotId.slice(0, 12)}</span></div>
            )}
            <div style={{ marginTop: 8, color: 'var(--warn)' }}>
              Warning: The existing database will be dropped and recreated. Use a staging target first.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dryRunOk} onChange={e => setDryRunOk(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
              I have reviewed the dry-run output and understand what will be restored.
            </span>
          </label>
          <WizardNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextDisabled={!dryRunOk} nextLabel="Confirm and continue" />
        </WizardCard>
      )}

      {step === 4 && (
        <WizardCard title="Ready to restore">
          <div style={{
            backgroundColor: 'var(--err-dim)',
            border: '1px solid color-mix(in srgb, var(--err) 25%, transparent)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>Restore summary</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Job: {selectedJob?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Service: {serviceName}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Database: {dbName}</div>
            {latestSnapshot && (
              <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>Snapshot: {latestSnapshot.snapshotId.slice(0, 12)} ({latestSnapshot.createdAt ? new Date(latestSnapshot.createdAt).toLocaleString() : 'unknown date'})</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: 'var(--warn)' }}>
              This action will be recorded in the audit log with DR mode flag.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(3)} style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--fg)' }}>Back</button>
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
