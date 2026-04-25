'use client'

import { useState, useTransition } from 'react'
import { updateRepository } from '@/app/actions/repositories'

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

interface Props {
  id: string
  name: string
  backend: string
  group: string
  config: Record<string, string>
  mountConfig: Record<string, string> | null
}

export function EditRepositoryForm({ id, name, backend, group, config, mountConfig }: Props) {
  const [error, setError]  = useState('')
  const [isPending, start] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await updateRepository(id, fd)
      if (result && 'error' in result) setError(result.error)
    })
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <a href={`/repositories/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 20 }}>
        ← Repository
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Edit repository</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>Update repository settings and credentials.</p>

      <form onSubmit={handleSubmit}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>General</div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input name="name" type="text" required defaultValue={name} style={inputStyle} />
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>Backend</label>
              <input value={backend} disabled style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
            </div>
            <div>
              <label style={labelStyle}>Group <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
              <input name="group" type="text" defaultValue={group} placeholder="e.g. production" style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Backend configuration</div>

          {backend === 'local' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Path</label>
              <input name="path" type="text" required defaultValue={config['path'] ?? config['repositoryUrl'] ?? ''} style={inputStyle} />
            </div>
          )}

          {backend === 'nfs' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>NAS host / IP</label>
                <input name="host" type="text" defaultValue={mountConfig?.['host'] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Export path</label>
                <input name="remotePath" type="text" defaultValue={mountConfig?.['remotePath'] ?? ''} style={inputStyle} />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Mount options <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
              <input name="options" type="text" defaultValue={mountConfig?.['options'] ?? ''} placeholder="vers=3,soft" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Custom mount command <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional — overrides fields above)</span></label>
              <input name="mountCommand" type="text" defaultValue={mountConfig?.['mountCommand'] ?? ''} placeholder={'mount -t nfs 192.168.10.9:/volume1/backups {mountPoint}'} style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Use <code>{'{mountPoint}'}</code> as the mount directory placeholder.</div>
            </div>
          </>)}

          {backend === 'smb' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>NAS host / IP</label>
                <input name="host" type="text" defaultValue={mountConfig?.['host'] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Share name</label>
                <input name="remotePath" type="text" defaultValue={mountConfig?.['remotePath'] ?? ''} style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Username</label>
                <input name="username" type="text" defaultValue={mountConfig?.['username'] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Password <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input name="smbPassword" type="password" placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Domain <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input name="domain" type="text" defaultValue={mountConfig?.['domain'] ?? ''} placeholder="WORKGROUP" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mount options <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input name="options" type="text" defaultValue={mountConfig?.['options'] ?? ''} placeholder="vers=3.0,uid=0" style={inputStyle} />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Custom mount command <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional — overrides fields above)</span></label>
              <input name="mountCommand" type="text" defaultValue={mountConfig?.['mountCommand'] ?? ''} placeholder={'mount -t cifs //192.168.10.9/backups {mountPoint} -o username=user,password=pass,vers=3.0'} style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
                Use <code>{'{mountPoint}'}</code> as the mount directory. Requires <code>cifs-utils</code>: <code>sudo apt-get install -y cifs-utils</code>
              </div>
            </div>
          </>)}

          {backend === 's3' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket</label>
              <input name="bucket" type="text" required defaultValue={(config['repositoryUrl'] ?? '').replace(/^s3:[^/]+\//, '')} style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Region</label>
                <input name="region" type="text" defaultValue={config['AWS_DEFAULT_REGION'] ?? 'us-east-1'} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Custom endpoint <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input name="endpoint" type="text" defaultValue={config['endpoint'] ?? ''} style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Access key ID</label>
                <input name="accessKey" type="text" defaultValue={config['AWS_ACCESS_KEY_ID'] ?? ''} placeholder="Leave blank to keep" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Secret access key <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input name="secretKey" type="password" placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
          </>)}

          {backend === 'r2' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Account ID</label>
              <input name="accountId" type="text" required defaultValue={config['repositoryUrl']?.match(/\/\/([^.]+)\./)?.[1] ?? ''} style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket</label>
              <input name="bucket" type="text" required defaultValue={(config['repositoryUrl'] ?? '').split('/').pop() ?? ''} style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Access key ID</label>
                <input name="accessKey" type="text" defaultValue={config['AWS_ACCESS_KEY_ID'] ?? ''} placeholder="Leave blank to keep" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Secret access key <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input name="secretKey" type="password" placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
          </>)}

          {backend === 'b2' && (<>
            <div style={fieldStyle}>
              <label style={labelStyle}>Bucket name</label>
              <input name="bucket" type="text" required defaultValue={(config['repositoryUrl'] ?? '').replace('b2:', '')} style={inputStyle} />
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Key ID <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input name="keyId" type="text" defaultValue={config['B2_ACCOUNT_ID'] ?? ''} placeholder="Leave blank to keep" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Application key <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input name="appKey" type="password" placeholder="••••••••" style={inputStyle} />
              </div>
            </div>
          </>)}

          {backend === 'sftp' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Host</label>
                <input name="host" type="text" required defaultValue={config['host'] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input name="port" type="number" defaultValue={config['port'] ?? '22'} style={inputStyle} />
              </div>
            </div>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Username</label>
                <input name="user" type="text" required defaultValue={config['user'] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Path</label>
                <input name="path" type="text" required defaultValue={(config['repositoryUrl'] ?? '').replace(/^sftp:[^:]+:/, '')} style={inputStyle} />
              </div>
            </div>
          </>)}

          {backend === 'rclone' && (<>
            <div style={grid2}>
              <div>
                <label style={labelStyle}>Remote name</label>
                <input name="remote" type="text" required defaultValue={(config['repositoryUrl'] ?? '').replace(/^rclone:/, '').split(':')[0] ?? ''} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Path</label>
                <input name="path" type="text" required defaultValue={(config['repositoryUrl'] ?? '').replace(/^rclone:[^:]+:/, '')} style={inputStyle} />
              </div>
            </div>
          </>)}
        </div>

        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Repository password</div>
          <div style={fieldStyle}>
            <label style={labelStyle}>New restic password <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>(leave blank to keep current)</span></label>
            <input name="password" type="password" placeholder="••••••••" style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>
              Changing this does NOT change the actual restic repository encryption — only updates what BackupOS uses to connect.
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius-sm)', fontSize: 13, backgroundColor: 'var(--err-dim)', color: 'var(--err)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
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
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
          <a
            href={`/repositories/${id}`}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg)',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            }}
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
