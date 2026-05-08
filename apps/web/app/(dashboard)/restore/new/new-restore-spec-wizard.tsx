'use client'

import { useState, useEffect, useTransition } from 'react'
import { validateSpec, createSpec } from '@/app/actions/restore'

type RunOption = { id: string; startedAt: string; snapshotIds: string[] }
type DiskInfo  = { uuid: string; user_device: string; virtual_size: number }
type XcpJob    = {
  id:            string
  name:          string
  vmName:        string
  vmUUID:        string
  integrationId: string
  disks:         DiskInfo[]
  runs:          RunOption[]
}

type SR = { uuid: string; name_label: string; sr_type: string; physical_size: number; physical_utilisation: number }

const DEFAULT_YAML = `name: my-restore
description: Description
version: "1.0"

steps:
  - name: Restore step
    type: filesystem_restore
    snapshot_path: /data/myservice
    target_path:   /data/myservice
    on_failure: abort`

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500,
}
const section: React.CSSProperties = { marginBottom: 20 }

function fmtBytes(b: number): string {
  if (b >= 1024**4) return (b / 1024**4).toFixed(1) + ' TiB'
  if (b >= 1024**3) return (b / 1024**3).toFixed(1) + ' GiB'
  if (b >= 1024**2) return (b / 1024**2).toFixed(1) + ' MiB'
  return b + ' B'
}

export function NewRestoreSpecWizard({ xcpJobs }: { xcpJobs: XcpJob[] }) {
  const [tab, setTab] = useState<'form' | 'yaml'>('form')
  const [name, setName] = useState('')

  // YAML mode state
  const [yaml, setYaml] = useState(DEFAULT_YAML)
  const [validation, setValidation] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError] = useState('')
  const [isValidating, startValidating] = useTransition()
  const [isSaving, startSaving] = useTransition()

  // Form mode state
  const [stepName, setStepName] = useState('Restore VM')
  const [selectedJobId, setSelectedJobId] = useState(xcpJobs[0]?.id ?? '')
  const selectedJob = xcpJobs.find(j => j.id === selectedJobId)

  const [vmName, setVmName] = useState(() => selectedJob ? `${selectedJob.vmName}-restored` : '')
  useEffect(() => {
    if (selectedJob) setVmName(`${selectedJob.vmName}-restored`)
  }, [selectedJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [targetSrUUID, setTargetSrUUID] = useState('')
  const [memoryMiB, setMemoryMiB] = useState<number | ''>('')
  const [vcpus, setVcpus] = useState<number | ''>('')

  const [srs, setSrs] = useState<SR[] | null>(null)
  const [srsLoading, setSrsLoading] = useState(false)
  const [srsError, setSrsError] = useState('')

  useEffect(() => {
    if (!selectedJob?.integrationId) { setSrs(null); return }
    setSrsLoading(true)
    setSrsError('')
    setTargetSrUUID('')
    fetch(`/api/internal/integration/${selectedJob.integrationId}/srs`)
      .then(r => r.json())
      .then((j: { error?: string; srs?: SR[] }) => {
        if (j.error) { setSrsError(j.error); setSrs([]) }
        else { setSrs(j.srs ?? []) }
      })
      .catch((e: unknown) => setSrsError(String(e)))
      .finally(() => setSrsLoading(false))
  }, [selectedJob?.integrationId])

  function generateYaml(): string {
    if (!selectedJob) return DEFAULT_YAML
    const lines: string[] = [
      `name: ${name || 'restore-' + selectedJob.name}`,
      `description: Restore VM ${selectedJob.vmName} from backup`,
      `version: "1.0"`,
      ``,
      `steps:`,
      `  - name: ${stepName}`,
      `    type: xcpng_vm_restore`,
      `    backup_job_id: "${selectedJob.id}"`,
      `    vm_uuid: "${selectedJob.vmUUID}"`,
      `    vm_name: "${vmName}"`,
      `    target_sr_uuid: "${targetSrUUID}"`,
    ]
    if (memoryMiB && memoryMiB > 0) lines.push(`    memory_bytes: ${Number(memoryMiB) * 1024 * 1024}`)
    if (vcpus && vcpus > 0) lines.push(`    vcpus: ${vcpus}`)
    lines.push(`    on_failure: abort`)
    return lines.join('\n')
  }

  function handleValidate(yamlContent: string) {
    setValidation(null)
    startValidating(async () => {
      const result = await validateSpec(yamlContent)
      setValidation(result.ok
        ? { ok: true, message: 'YAML is valid — all steps parsed successfully.' }
        : { ok: false, message: result.error })
    })
  }

  function handleSave(yamlContent: string) {
    setError('')
    startSaving(async () => {
      const result = await createSpec(name, yamlContent)
      if (result && 'error' in result) setError(result.error)
    })
  }

  const formIsValid = name.trim() !== '' && selectedJob != null && vmName.trim() !== '' && targetSrUUID !== ''
  const activeYaml  = tab === 'form' ? generateYaml() : yaml

  return (
    <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Restore spec name</label>
        <input
          type="text"
          placeholder="my-vm-restore"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inp}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['form', 'yaml'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--fg)' : 'var(--fg-dim)',
              marginBottom: -1,
            }}
          >
            {t === 'form' ? 'Form (XCP-ng VM)' : 'YAML (advanced)'}
          </button>
        ))}
      </div>

      {tab === 'form' && (
        <>
          {xcpJobs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: 12, background: 'var(--surf2)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
              No XCP-ng VM backup jobs found. Create an xcpng_vm backup job first, then come back to author a restore spec for it.
              You can also use the YAML tab to author other step types (filesystem, database, etc.).
            </div>
          ) : (
            <>
              <div style={section}>
                <label style={lbl}>Backup job</label>
                <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)} style={inp}>
                  {xcpJobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.name} (VM: {j.vmName}, {j.disks.length} disk{j.disks.length === 1 ? '' : 's'}, {j.runs.length} successful run{j.runs.length === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={section}>
                <label style={lbl}>Step name</label>
                <input type="text" value={stepName} onChange={e => setStepName(e.target.value)} style={inp} placeholder="Restore VM" />
              </div>

              <div style={section}>
                <label style={lbl}>New VM name</label>
                <input type="text" value={vmName} onChange={e => setVmName(e.target.value)} style={inp} placeholder={`${selectedJob?.vmName ?? ''}-restored`} />
              </div>

              <div style={section}>
                <label style={lbl}>
                  Target storage (SR)
                  {srsLoading && <span style={{ marginLeft: 8, color: 'var(--fg-dim)', fontWeight: 400 }}>loading…</span>}
                </label>
                {srsError && <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>{srsError}</div>}
                <select value={targetSrUUID} onChange={e => setTargetSrUUID(e.target.value)} style={inp} disabled={srsLoading}>
                  <option value="">— select an SR —</option>
                  {srs?.filter(s => s.sr_type !== 'iso' && s.sr_type !== 'udev').map(s => {
                    const free = s.physical_size - s.physical_utilisation
                    return (
                      <option key={s.uuid} value={s.uuid}>
                        {s.name_label} ({s.sr_type}, {fmtBytes(free)} free of {fmtBytes(s.physical_size)})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>Memory (MiB) — optional, defaults to source VM</label>
                  <input
                    type="number"
                    placeholder="e.g. 2048"
                    value={memoryMiB}
                    onChange={e => setMemoryMiB(e.target.value === '' ? '' : Number(e.target.value))}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>vCPUs — optional, defaults to source VM</label>
                  <input
                    type="number"
                    placeholder="e.g. 2"
                    value={vcpus}
                    onChange={e => setVcpus(e.target.value === '' ? '' : Number(e.target.value))}
                    style={inp}
                  />
                </div>
              </div>

              <details style={{ marginBottom: 16, padding: 12, background: 'var(--surf2)', borderRadius: 'var(--radius-sm)' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--fg-mute)' }}>Generated YAML preview</summary>
                <pre style={{ marginTop: 12, fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', color: 'var(--fg)', margin: '12px 0 0' }}>
                  {generateYaml()}
                </pre>
              </details>
            </>
          )}
        </>
      )}

      {tab === 'yaml' && (
        <div style={section}>
          <label style={lbl}>YAML spec</label>
          <textarea
            value={yaml}
            onChange={e => { setYaml(e.target.value); setValidation(null) }}
            rows={28}
            style={{ ...inp, fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6, resize: 'vertical' }}
          />
        </div>
      )}

      {validation && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13,
          backgroundColor: validation.ok ? 'var(--ok-dim)' : 'var(--err-dim)',
          border: `1px solid ${validation.ok ? 'color-mix(in srgb, var(--ok) 30%, transparent)' : 'color-mix(in srgb, var(--err) 30%, transparent)'}`,
          color: validation.ok ? 'var(--ok)' : 'var(--err)',
        }}>
          {validation.message}
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => handleValidate(activeYaml)}
          disabled={isValidating || (tab === 'form' && !formIsValid)}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surf2)', color: 'var(--fg)',
            opacity: (isValidating || (tab === 'form' && !formIsValid)) ? 0.6 : 1,
          }}
        >
          {isValidating ? 'Validating…' : 'Validate'}
        </button>
        <button
          onClick={() => handleSave(activeYaml)}
          disabled={isSaving || !name.trim() || (tab === 'form' && !formIsValid)}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            cursor: (isSaving || !name.trim() || (tab === 'form' && !formIsValid)) ? 'not-allowed' : 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            opacity: (isSaving || !name.trim() || (tab === 'form' && !formIsValid)) ? 0.6 : 1,
          }}
        >
          {isSaving ? 'Saving…' : 'Save spec'}
        </button>
      </div>
    </div>
  )
}
