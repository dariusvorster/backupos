'use client'

import { useState, useTransition, useRef } from 'react'
import { createRepository, testCloudConnection } from '@/app/actions/repositories'

const BACKENDS = [
  { value: 'local',  label: 'Local filesystem' },
  { value: 'nfs',    label: 'NFS share' },
  { value: 'smb',    label: 'SMB / CIFS share' },
  { value: 's3',     label: 'Amazon S3' },
  { value: 'r2',     label: 'Cloudflare R2' },
  { value: 'b2',     label: 'Backblaze B2' },
  { value: 'sftp',   label: 'SFTP' },
  { value: 'rclone', label: 'Rclone' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4,
}
const fieldStyle: React.CSSProperties = { marginBottom: 16 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }

export default function NewRepositoryPage() {
  const [backend, setBackend]               = useState('local')
  const [error, setError]                   = useState('')
  const [isPending, start]                  = useTransition()
  const [mountState, setMountState]         = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [mountDetail, setMountDetail]       = useState<string | null>(null)
  const [cloudTestState, setCloudTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [cloudTestDetail, setCloudTestDetail] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await createRepository(fd)
      if (result && 'error' in result) setError(result.error)
    })
  }

  async function handleTestMount() {
    if (!formRef.current) return
    const fd         = new FormData(formRef.current)
    const mountPoint = `/mnt/backupos/test-${Date.now()}`
    let host = '', remotePath = '', username = '', password = '', domain = ''

    if (backend === 'nfs') {
      const nfsPath  = (fd.get('nfsPath') as string)?.trim() ?? ''
      const colonIdx = nfsPath.indexOf(':')
      if (!nfsPath || colonIdx === -1) {
        setMountState('error'); setMountDetail('Enter NFS path as host:/export/path'); return
      }
      host = nfsPath.slice(0, colonIdx); remotePath = nfsPath.slice(colonIdx + 1)
    } else {
      const raw = (fd.get('smbShare') as string)?.trim() ?? ''
      if (!raw) { setMountState('error'); setMountDetail('Enter SMB share path'); return }
      const s   = raw.replace(/\\/g, '/').replace(/^\/\//, '')
      if (s.includes(':')) { setMountState('error'); setMountDetail('Remove the colon — use //host/share (e.g. //192.168.10.9/Backups)'); return }
      const idx = s.indexOf('/')
      if (idx === -1) { setMountState('error'); setMountDetail('Format must be //host/share'); return }
      host = s.slice(0, idx); remotePath = s.slice(idx + 1)
      username = (fd.get('username') as string)?.trim() ?? ''
      password = (fd.get('smbPassword') as string)?.trim() ?? ''
      domain   = (fd.get('domain') as string)?.trim() ?? ''
    }

    const mountConfig = {
      type: backend as 'nfs' | 'smb',
      host, remotePath, mountPoint,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(domain   ? { domain }   : {}),
    }

    setMountState('testing'); setMountDetail(null)
    try {
      const res  = await fetch('/api/mount/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mountConfig }) })
      const body = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) { setMountState('error'); setMountDetail(body.error ?? 'Mount failed') }
      else { setMountState('ok'); setMountDetail('Mounted successfully') }
    } catch {
      setMountState('error'); setMountDetail('Network error')
    }
  }

  async function handleTestCloud() {
    if (!formRef.current) return
    setCloudTestState('testing'); setCloudTestDetail(null)
    try {
      const fd     = new FormData(formRef.current)
      const result = await testCloudConnection(fd)
      setCloudTestState(result.ok ? 'ok' : 'error')
      setCloudTestDetail(result.message)
    } catch (e) {
      setCloudTestState('error'); setCloudTestDetail(String(e))
    }
  }

  const testBtn = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <button type="button" onClick={() => { void handleTestMount() }} disabled={mountState === 'testing'}
        style={{ padding: '5px 14px', fontSize: 12, cursor: mountState === 'testing' ? 'wait' : 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surf2)', color: 'var(--fg)' }}>
        {mountState === 'testing' ? 'Testing…' : 'Test mount'}
      </button>
      {mountDetail && (
        <span style={{ fontSize: 11, color: mountState === 'ok' ? 'var(--ok)' : 'var(--err)' }}>
          {mountState === 'ok' ? '✓ ' : '✗ '}{mountDetail}
        </span>
      )}
    </div>
  )

  const cloudTestBtn = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <button type="button" onClick={() => { void handleTestCloud() }} disabled={cloudTestState === 'testing'}
        style={{ padding: '5px 14px', fontSize: 12, cursor: cloudTestState === 'testing' ? 'wait' : 'pointer', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surf2)', color: 'var(--fg)' }}>
        {cloudTestState === 'testing' ? 'Testing…' : 'Test connection'}
      </button>
      {cloudTestDetail && (
        <span style={{ fontSize: 11, color: cloudTestState === 'ok' ? 'var(--ok)' : 'var(--err)' }}>
          {cloudTestState === 'ok' ? '✓ ' : '✗ '}{cloudTestDetail}
        </span>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 600 }}>
      <a href="/repositories" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 20 }}>← Repositories</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Add repository</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>Connect a Restic repository to start tracking snapshots and health.</p>

      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>General</div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input name="name" type="text" required placeholder="e.g. homelab-r2" style={inputStyle} />
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>Backend</label>
              <select name="backend" value={backend} onChange={e => { setBackend(e.target.value); setCloudTestState('idle'); setCloudTestDetail(null) }} style={inputStyle}>
                {BACKENDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Group <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
              <input name="group" type="text" placeholder="e.g. production" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Backend-specific config */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Backend configuration</div>

          {backend === 'local' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Path</label>
              <input name="path" type="text" required placeholder="/mnt/backups/restic-repo" style={inputStyle} />
            </div>
          )}

          {backend === 'nfs' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>NFS share</label>
              <input name="nfsPath" type="text" required placeholder="192.168.10.9:/volume1/Backups" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Format: <code>host:/export/path</code></div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Repository path within share <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
              <input name="repoPath" type="text" placeholder="restic-repo" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Sub-directory inside the share where the Restic repo lives. Leave blank to use the share root.</div>
            </div>
            {testBtn}
          </>)}

          {backend === 'smb' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>SMB share</label>
              <input name="smbShare" type="text" required placeholder="//192.168.10.9/Backups" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Format: <code>//host/share</code></div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Username</label>
                <input name="username" type="text" required placeholder="backupuser" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input name="smbPassword" type="password" required placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Repository path within share <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
              <input name="repoPath" type="text" placeholder="restic-repo" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Sub-directory inside the share where the Restic repo lives. Leave blank to use the share root.</div>
            </div>
            {testBtn}
          </>)}

          {backend === 's3' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket</label>
              <input name="bucket" type="text" required placeholder="my-backup-bucket" style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Region</label>
                <input name="region" type="text" placeholder="us-east-1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Custom endpoint <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input name="endpoint" type="text" placeholder="https://s3.example.com" style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Access key ID</label>
                <input name="accessKey" type="text" required placeholder="AKIAIOSFODNN7EXAMPLE" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Secret access key</label>
                <input name="secretKey" type="password" required placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
            {cloudTestBtn}
          </>)}

          {backend === 'r2' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Account ID</label>
              <input name="accountId" type="text" required placeholder="abc123def456..." style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket</label>
              <input name="bucket" type="text" required placeholder="my-backup-bucket" style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Access key ID</label>
                <input name="accessKey" type="text" required placeholder="R2 access key" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Secret access key</label>
                <input name="secretKey" type="password" required placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
            {cloudTestBtn}
          </>)}

          {backend === 'b2' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket name</label>
              <input name="bucket" type="text" required placeholder="my-backup-bucket" style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Key ID</label>
                <input name="keyId" type="text" required placeholder="B2 key ID" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Application key</label>
                <input name="appKey" type="password" required placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
            {cloudTestBtn}
          </>)}

          {backend === 'sftp' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Host</label>
                <input name="host" type="text" required placeholder="backup.example.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input name="port" type="number" defaultValue={22} style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Username</label>
                <input name="user" type="text" required placeholder="backupuser" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Path</label>
                <input name="path" type="text" required placeholder="/home/backupuser/restic" style={inputStyle} />
              </div>
            </div>
            {cloudTestBtn}
          </>)}

          {backend === 'rclone' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Remote name</label>
                <input name="remote" type="text" required placeholder="myremote" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Path</label>
                <input name="path" type="text" required placeholder="backup/restic" style={inputStyle} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
              The remote must already be configured in rclone on the agent host.
            </div>
          </>)}
        </div>

        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Repository password</div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Restic password</label>
            <input name="password" type="password" required placeholder="••••••••" style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
              The password used to encrypt and decrypt this Restic repository.
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '8px 24px', fontSize: 13, fontWeight: 600,
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Saving…' : 'Add repository'}
        </button>
      </form>
    </div>
  )
}
