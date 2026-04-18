'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Job { id: string; name: string }

const TARGET_TYPES = [
  { value: 'temp_directory',    label: 'Temp directory',     desc: 'Restore to a temporary directory on the agent host, cleaned up after verification' },
  { value: 'docker_volume',     label: 'Docker volume',      desc: 'Restore to a named Docker volume on the agent host' },
  { value: 'proxmox_vm_clone',  label: 'Proxmox VM clone',   desc: 'Restore into a cloned Proxmox VM — requires a hypervisor driver' },
  { value: 'ssh_target',        label: 'SSH target',         desc: 'Restore to a remote host via SSH' },
]

const STEP_LABELS = ['Pick job', 'Sandbox target', 'Validation hook', 'Schedule']

interface Props { jobs: Job[] }

export function VerificationWizard({ jobs }: Props) {
  const [step,           setStep]           = useState(0)
  const [jobId,          setJobId]          = useState('')
  const [targetType,     setTargetType]     = useState('')
  const [validationHook, setValidationHook] = useState('')
  const [testName,       setTestName]       = useState('')
  const [schedule,       setSchedule]       = useState('0 3 * * 0')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500,
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                backgroundColor: i === step ? 'var(--accent)' : i < step ? 'var(--ok)' : 'var(--surf2)',
                color: i <= step ? 'var(--bg)' : 'var(--fg-dim)',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? 'var(--fg)' : 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 1, backgroundColor: i < step ? 'var(--ok)' : 'var(--border)', margin: '0 8px', marginBottom: 22 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>

        {/* Step 0: Pick job */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Pick a backup job</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              Choose which backup job this test will verify. BackupOS will restore the latest snapshot from this job into the sandbox.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Job</label>
              <select
                value={jobId}
                onChange={e => setJobId(e.target.value)}
                style={{ ...inputStyle }}
              >
                <option value="">— Select a job —</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Sandbox target */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Choose a sandbox target</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              Where should BackupOS restore the snapshot for testing? The sandbox is torn down after each run.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TARGET_TYPES.map(tt => (
                <label key={tt.value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  backgroundColor: targetType === tt.value ? 'var(--accent-dim)' : 'var(--surf2)',
                  border: `1px solid ${targetType === tt.value ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="targetType"
                    value={tt.value}
                    checked={targetType === tt.value}
                    onChange={() => setTargetType(tt.value)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{tt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{tt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Validation hook + name */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Validation hook</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              A shell command BackupOS runs after the restore. Exit code 0 = passed, non-zero = failed. Leave blank to only check that restore completed without errors.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Test name</label>
              <input
                type="text"
                placeholder="weekly-postgres-verify"
                value={testName}
                onChange={e => setTestName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>Validation command (optional)</label>
              <input
                type="text"
                placeholder='psql -c "SELECT COUNT(*) FROM users;"'
                value={validationHook}
                onChange={e => setValidationHook(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
              The command runs inside the restored environment. Environment variables <code>RESTORE_PATH</code> and <code>JOB_NAME</code> are set.
            </div>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Schedule</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              How often should this verification run? Weekly is the recommended default — frequent enough to catch regressions, not so frequent it wastes compute.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Schedule (cron)</label>
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
                <code>0 3 * * 0</code> = weekly on Sunday at 03:00 &nbsp;·&nbsp; <code>0 3 * * *</code> = nightly at 03:00
              </div>
            </div>

            <div style={{ padding: 16, backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Summary</div>
              <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>
                <div><span style={{ color: 'var(--fg-mute)' }}>Name:</span> {testName || '—'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Target:</span> {TARGET_TYPES.find(t => t.value === targetType)?.label ?? '—'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Hook:</span> {validationHook || 'none'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Schedule:</span> <code style={{ fontFamily: 'var(--font-mono)' }}>{schedule}</code></div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <div>
            {step > 0 && (
              <Button variant="secondary" size="md" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep(s => s + 1)}
                disabled={
                  (step === 0 && !jobId) ||
                  (step === 1 && !targetType)
                }
              >
                Continue
              </Button>
            ) : (
              <Button variant="primary" size="md">
                Create test
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
