'use client'

import { useState } from 'react'
import { triggerComposeRestore } from '@/app/actions/compose-restore'

type RunOption = { id: string; startedAt: string; snapshotIds: string[] }
type JobOption = { id: string; name: string; projectName: string; agentId: string | null; runs: RunOption[] }

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500,
}
const section: React.CSSProperties = {
  marginBottom: 20,
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ComposeRestoreWizard({ jobs }: { jobs: JobOption[] }) {
  const [selectedJobId, setSelectedJobId]   = useState(jobs[0]?.id ?? '')
  const [selectedRunId, setSelectedRunId]   = useState(jobs[0]?.runs[0]?.id ?? '')
  const [mode, setMode]                     = useState<'in_place' | 'side_by_side'>('side_by_side')
  const [newProjectName, setNewProjectName] = useState(() => {
    const proj = jobs[0]?.projectName ?? ''
    return proj ? `${proj}-restored` : ''
  })
  const [restoreComposeFile, setRestoreComposeFile] = useState(true)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [confirmText, setConfirmText]       = useState('')
  const [validationError, setValidationError] = useState<string | undefined>()

  const selectedJob = jobs.find(j => j.id === selectedJobId)
  const runs        = selectedJob?.runs ?? []
  const selectedRun = runs.find(r => r.id === selectedRunId) ?? runs[0]

  const handleJobChange = (newJobId: string) => {
    setSelectedJobId(newJobId)
    const j = jobs.find(j => j.id === newJobId)
    setSelectedRunId(j?.runs[0]?.id ?? '')
    setNewProjectName(j?.projectName ? `${j.projectName}-restored` : '')
    setConfirmChecked(false)
    setConfirmText('')
    setValidationError(undefined)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (mode === 'in_place') {
      const projectName = selectedJob?.projectName ?? ''
      if (!confirmChecked) {
        e.preventDefault()
        setValidationError('You must check the confirmation box.')
        return
      }
      if (confirmText !== projectName) {
        e.preventDefault()
        setValidationError(`Type "${projectName}" exactly to confirm.`)
        return
      }
    }
    if (mode === 'side_by_side' && !newProjectName.trim()) {
      e.preventDefault()
      setValidationError('New project name is required for side-by-side restore.')
      return
    }
    setValidationError(undefined)
  }

  if (jobs.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: '12px', background: 'var(--surf3)', borderRadius: 'var(--radius-sm)' }}>
        No compose_project jobs found. Create a compose backup job first.
      </div>
    )
  }

  return (
    <form action={triggerComposeRestore} onSubmit={handleSubmit}>
      {/* Hidden fields for server action */}
      <input type="hidden" name="jobId"      value={selectedJobId} />
      <input type="hidden" name="sourceRunId" value={selectedRun?.id ?? ''} />
      <input type="hidden" name="mode"       value={mode} />
      <input type="hidden" name="restoreComposeFile" value={restoreComposeFile ? '1' : '0'} />

      <div style={section}>
        <label style={lbl}>Compose job</label>
        <select value={selectedJobId} onChange={e => handleJobChange(e.target.value)} style={inp}>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.name} ({j.projectName})</option>
          ))}
        </select>
      </div>

      <div style={section}>
        <label style={lbl}>Snapshot to restore</label>
        {runs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>No successful runs for this job yet.</div>
        ) : (
          <select
            value={selectedRun?.id ?? ''}
            onChange={e => setSelectedRunId(e.target.value)}
            style={inp}
          >
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {fmt(r.startedAt)} — {r.snapshotIds.length} snapshot{r.snapshotIds.length !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={section}>
        <label style={lbl}>Restore mode</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['side_by_side', 'in_place'] as const).map(m => (
            <label key={m} style={{
              display: 'flex', gap: 10, padding: '10px 14px', cursor: 'pointer',
              border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: mode === m ? 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 8%)' : 'var(--surf2)',
            }}>
              <input type="radio" name="_mode_ui" value={m} checked={mode === m} onChange={() => {
                setMode(m)
                setConfirmChecked(false)
                setConfirmText('')
                setValidationError(undefined)
              }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {m === 'side_by_side' ? 'Side-by-side (safe)' : 'In-place (DESTRUCTIVE)'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                  {m === 'side_by_side'
                    ? 'Restore into a new project. Original stack stays running. Verify, then promote manually.'
                    : 'Replace existing volumes. Services will be stopped during restore. Data not in the snapshot will be lost.'}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {mode === 'side_by_side' && (
        <div style={section}>
          <label style={lbl}>New project name</label>
          <input
            type="text"
            name="sideBySideProjectName"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            placeholder={`${selectedJob?.projectName ?? 'myapp'}-restored`}
            style={inp}
          />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Docker volumes will be created as <code>{newProjectName || '…'}_&lt;vol&gt;</code>
          </div>
        </div>
      )}

      {mode === 'in_place' && (
        <div style={{ ...section, padding: '12px 14px', background: 'color-mix(in srgb, var(--err) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--err) 30%, transparent)', borderRadius: 'var(--radius-sm)' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={e => setConfirmChecked(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--err)', width: 14, height: 14 }}
            />
            <span style={{ fontSize: 12, color: 'var(--fg)' }}>
              I understand this will overwrite the volumes of <strong>{selectedJob?.projectName}</strong> and stop all its services. Data not in the snapshot will be lost permanently.
            </span>
          </label>
          <label style={lbl}>Type <strong>{selectedJob?.projectName}</strong> to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={selectedJob?.projectName ?? 'project-name'}
            style={{ ...inp, borderColor: confirmText === selectedJob?.projectName ? 'var(--success)' : 'var(--border)' }}
            autoComplete="off"
          />
        </div>
      )}

      <div style={section}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={restoreComposeFile}
            onChange={e => setRestoreComposeFile(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          Also restore compose YAML file (if backed up)
        </label>
      </div>

      {validationError && (
        <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 12, padding: '6px 10px',
          background: 'color-mix(in srgb, var(--err) 10%, transparent)', borderRadius: 'var(--radius-sm)' }}>
          {validationError}
        </div>
      )}

      <button
        type="submit"
        disabled={runs.length === 0}
        style={{
          padding: '9px 20px', cursor: runs.length === 0 ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: mode === 'in_place' ? 'var(--err)' : 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          opacity: runs.length === 0 ? 0.5 : 1,
        }}
      >
        {mode === 'in_place' ? 'Restore in-place' : 'Restore side-by-side'}
      </button>
    </form>
  )
}
