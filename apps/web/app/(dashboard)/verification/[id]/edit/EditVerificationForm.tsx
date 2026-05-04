'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { updateVerificationTest } from '@/app/actions/verification'

interface SshInitial {
  host:          string
  port:          number
  user:          string
  remoteDir:     string
  cleanupRemote: boolean
}

interface Props {
  id:                    string
  targetType:            string
  initialName:           string
  initialSchedule:       string
  initialValidationHook: string
  initialSsh:            SshInitial | null
}

export function EditVerificationForm(props: Props) {
  const router = useRouter()
  const [name,           setName]           = useState(props.initialName)
  const [schedule,       setSchedule]       = useState(props.initialSchedule)
  const [validationHook, setValidationHook] = useState(props.initialValidationHook)

  const [sshHost,       setSshHost]       = useState(props.initialSsh?.host ?? '')
  const [sshPort,       setSshPort]       = useState(String(props.initialSsh?.port ?? 22))
  const [sshUser,       setSshUser]       = useState(props.initialSsh?.user ?? '')
  const [sshKey,        setSshKey]        = useState('')  // blank = keep existing
  const [remoteDir,     setRemoteDir]     = useState(props.initialSsh?.remoteDir ?? '')
  const [cleanupRemote, setCleanupRemote] = useState(props.initialSsh?.cleanupRemote ?? true)

  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateVerificationTest({
        id:             props.id,
        name,
        schedule,
        validationHook,
        ...(props.targetType === 'ssh_target' ? {
          sshHost,
          sshPort:       parseInt(sshPort, 10) || 22,
          sshUser,
          sshKey,
          remoteDir,
          cleanupRemote,
        } : {}),
      })
      if (result.error) { setError(result.error); return }
      router.push(`/verification/${props.id}`)
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500,
  }
  const fieldGroup: React.CSSProperties = { marginBottom: 20 }

  return (
    <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={fieldGroup}>
        <label style={labelStyle}>Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          style={inputStyle}
        />
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Target type</label>
        <input
          type="text"
          value={props.targetType.replace(/_/g, ' ')}
          disabled
          style={{ ...inputStyle, color: 'var(--fg-mute)' }}
        />
        <p style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 6 }}>
          Target type cannot be changed after creation. Delete and recreate the test to change.
        </p>
      </div>

      {props.targetType === 'ssh_target' && (
        <>
          <div style={fieldGroup}>
            <label style={labelStyle}>SSH host</label>
            <input type="text" required value={sshHost} onChange={(e) => setSshHost(e.target.value)} disabled={isPending} style={inputStyle} />
          </div>
          <div style={{ ...fieldGroup, display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
            <div>
              <label style={labelStyle}>SSH user</label>
              <input type="text" required value={sshUser} onChange={(e) => setSshUser(e.target.value)} disabled={isPending} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Port</label>
              <input type="number" value={sshPort} onChange={(e) => setSshPort(e.target.value)} disabled={isPending} style={inputStyle} />
            </div>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Remote directory</label>
            <input type="text" required value={remoteDir} onChange={(e) => setRemoteDir(e.target.value)} disabled={isPending} style={inputStyle} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>SSH private key (leave blank to keep existing)</label>
            <textarea
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              disabled={isPending}
              rows={6}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
          <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="cleanup-remote"
              checked={cleanupRemote}
              onChange={(e) => setCleanupRemote(e.target.checked)}
              disabled={isPending}
            />
            <label htmlFor="cleanup-remote" style={{ fontSize: 13, color: 'var(--fg)' }}>
              Clean up remote directory after verification
            </label>
          </div>
        </>
      )}

      <div style={fieldGroup}>
        <label style={labelStyle}>Validation hook</label>
        <input
          type="text"
          value={validationHook}
          onChange={(e) => setValidationHook(e.target.value)}
          disabled={isPending}
          placeholder="e.g. test -f /tmp/restore/important.db"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
        <p style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 6 }}>
          Optional shell command run after restore. Non-zero exit = test fails. Leave blank to skip.
        </p>
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Schedule (cron)</label>
        <input
          type="text"
          required
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          disabled={isPending}
          placeholder="0 3 * * 0"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, color: 'var(--err)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" size="md" onClick={onSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="ghost" size="md" onClick={() => router.push(`/verification/${props.id}`)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
