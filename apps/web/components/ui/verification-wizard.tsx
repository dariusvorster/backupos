'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createVerificationTest } from '@/app/actions/verification'

interface Job { id: string; name: string }

const TARGET_TYPES = [
  { value: 'temp_directory',    label: 'Temp directory',     desc: 'Restore to a temporary directory on the agent host, cleaned up after verification' },
  { value: 'docker_volume',     label: 'Docker volume',      desc: 'Restore to a named Docker volume on the agent host' },
  { value: 'proxmox_vm_clone',  label: 'Proxmox VM clone',   desc: 'Restore into a cloned Proxmox VM — requires a hypervisor driver' },
  { value: 'ssh_target',        label: 'SSH target',         desc: 'Restore to a remote host via SSH' },
]

// Step 2 (SSH config) is only shown when targetType === 'ssh_target'
const STEP_LABELS = ['Pick job', 'Sandbox target', 'SSH config', 'Validation hook', 'Schedule']

interface Props { jobs: Job[] }

export function VerificationWizard({ jobs }: Props) {
  const [step,           setStep]           = useState(0)
  const [jobId,          setJobId]          = useState('')
  const [targetType,     setTargetType]     = useState('')
  const [validationHook, setValidationHook] = useState('')
  const [testName,       setTestName]       = useState('')
  const [schedule,       setSchedule]       = useState('0 3 * * 0')
  const [submitting,     startSubmit]       = useTransition()

  // SSH config state
  const [sshHost,      setSshHost]      = useState('')
  const [sshUser,      setSshUser]      = useState('root')
  const [sshPort,      setSshPort]      = useState('22')
  const [sshRemoteDir, setSshRemoteDir] = useState('')
  const [sshKey,       setSshKey]       = useState('')
  const [sshCleanup,   setSshCleanup]   = useState(true)

  const isSsh = targetType === 'ssh_target'
  const lastStep = 4

  const handleNext = () => {
    if (step === 1 && !isSsh) setStep(3)
    else setStep(s => s + 1)
  }

  const handleBack = () => {
    if (step === 3 && !isSsh) setStep(1)
    else setStep(s => s - 1)
  }

  const continueDisabled =
    (step === 0 && !jobId) ||
    (step === 1 && !targetType) ||
    (step === 2 && isSsh && (!sshHost || !sshUser || !sshRemoteDir || !sshKey))

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500,
  }

  const isStepActive = (i: number) => {
    if (i === 2 && !isSsh) return false
    return i === step
  }

  const isStepDone = (i: number) => {
    if (i === 2 && !isSsh) return step > 2
    return i < step
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
                backgroundColor: isStepActive(i) ? 'var(--accent)' : isStepDone(i) ? 'var(--ok)' : 'var(--surf2)',
                color: isStepActive(i) || isStepDone(i) ? 'var(--bg)' : 'var(--fg-dim)',
              }}>
                {isStepDone(i) ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: isStepActive(i) ? 'var(--fg)' : 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 1, backgroundColor: isStepDone(i) ? 'var(--ok)' : 'var(--border)', margin: '0 8px', marginBottom: 22 }} />
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

        {/* Step 2: SSH config (only for ssh_target) */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>SSH target configuration</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              BackupOS will restore the snapshot locally, then rsync it to this remote host. The SSH private key is encrypted at rest.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Host</label>
                <input
                  type="text"
                  placeholder="192.168.1.50"
                  value={sshHost}
                  onChange={e => setSshHost(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={e => setSshPort(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>SSH user</label>
              <input
                type="text"
                placeholder="root"
                value={sshUser}
                onChange={e => setSshUser(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Remote directory</label>
              <input
                type="text"
                placeholder="/tmp/backupos-verify"
                value={sshRemoteDir}
                onChange={e => setSshRemoteDir(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Private key (PEM)</label>
              <textarea
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                value={sshKey}
                onChange={e => setSshKey(e.target.value)}
                rows={6}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sshCleanup}
                onChange={e => setSshCleanup(e.target.checked)}
              />
              <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>Remove remote directory after verification</span>
            </label>
          </div>
        )}

        {/* Step 3: Validation hook + name */}
        {step === 3 && (
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

        {/* Step 4: Schedule */}
        {step === 4 && (
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
                {isSsh && (
                  <div><span style={{ color: 'var(--fg-mute)' }}>SSH host:</span> {sshUser}@{sshHost}:{sshPort} → {sshRemoteDir}</div>
                )}
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
              <Button variant="secondary" size="md" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <div>
            {step < lastStep ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleNext}
                disabled={continueDisabled}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                disabled={submitting || !testName}
                onClick={() => startSubmit(() => createVerificationTest({
                  name: testName, jobId, targetType, validationHook, schedule,
                  ...(isSsh ? {
                    sshConfig: {
                      host:          sshHost,
                      user:          sshUser,
                      port:          parseInt(sshPort) || 22,
                      remoteDir:     sshRemoteDir,
                      sshKey,
                      cleanupRemote: sshCleanup,
                    },
                  } : {}),
                }))}
              >
                {submitting ? 'Creating…' : 'Create test'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
