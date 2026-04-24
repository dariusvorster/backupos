'use client'

import { useState } from 'react'

const SOURCE_TYPES = [
  { value: 'filesystem',     label: 'Filesystem',      desc: 'Directories and files on the agent host' },
  { value: 'docker_volume',  label: 'Docker volume',   desc: 'Named Docker volume' },
  { value: 'database',       label: 'Database',        desc: 'PostgreSQL, MySQL, SQLite, Redis' },
  { value: 'proxmox_vm',     label: 'Proxmox VM',      desc: 'Virtual machine via Proxmox API' },
  { value: 'proxmox_lxc',    label: 'Proxmox LXC',     desc: 'Container via Proxmox API' },
  { value: 'windows_system', label: 'Windows system',  desc: 'Full system backup via VSS' },
  { value: 'nas_share',      label: 'NAS share',       desc: 'SMB or NFS share' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500,
}

const hintStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--fg-dim)', marginTop: 4,
}

type Cfg = Record<string, unknown>

function FilesystemFields({ cfg }: { cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16 }}>
      <label style={labelStyle}>Paths to back up</label>
      <textarea
        name="paths"
        rows={4}
        defaultValue={(cfg.paths as string[] | undefined)?.join('\n') ?? ''}
        placeholder={'/home/user\n/var/www\n/etc/nginx'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One path per line. Absolute paths only.</p>
      <label style={{ ...labelStyle, marginTop: 12 }}>Exclude patterns (optional)</label>
      <textarea
        name="exclude"
        rows={2}
        defaultValue={(cfg.exclude as string[] | undefined)?.join('\n') ?? ''}
        placeholder={'*.log\nnode_modules/'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One pattern per line.</p>
    </div>
  )
}

function DockerVolumeFields({ cfg }: { cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16 }}>
      <label style={labelStyle}>Volume names</label>
      <textarea
        name="volumes"
        rows={3}
        defaultValue={(cfg.volumes as string[] | undefined)?.join('\n') ?? ''}
        placeholder={'postgres_data\nredis_data'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One Docker volume name per line.</p>
    </div>
  )
}

function DatabaseFields({ cfg }: { cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Database type</label>
        <select name="dbType" defaultValue={(cfg.type as string) ?? 'postgresql'} style={inputStyle}>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL / MariaDB</option>
          <option value="sqlite">SQLite</option>
          <option value="redis">Redis</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Host</label>
        <input name="dbHost" type="text" defaultValue={(cfg.host as string) ?? 'localhost'} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Port</label>
        <input name="dbPort" type="number" defaultValue={(cfg.port as number) ?? ''} placeholder="5432" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Database name</label>
        <input name="database" type="text" defaultValue={(cfg.database as string) ?? ''} placeholder="mydb" style={inputStyle} required />
      </div>
      <div>
        <label style={labelStyle}>Username</label>
        <input name="dbUser" type="text" defaultValue={(cfg.user as string) ?? ''} placeholder="postgres" style={inputStyle} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Password</label>
        <input name="dbPassword" type="password" defaultValue={(cfg.password as string) ?? ''} style={inputStyle} />
      </div>
    </div>
  )
}

function ProxmoxFields({ label, cfg }: { label: string; cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <label style={labelStyle}>{label} ID</label>
        <input name="vmId" type="text" defaultValue={(cfg.vmId as string) ?? ''} placeholder="100" style={inputStyle} required />
      </div>
      <div>
        <label style={labelStyle}>Proxmox URL</label>
        <input name="proxmoxUrl" type="text" defaultValue={(cfg.proxmoxUrl as string) ?? ''} placeholder="https://pve.local:8006" style={inputStyle} required />
      </div>
      <div>
        <label style={labelStyle}>Username</label>
        <input name="proxmoxUser" type="text" defaultValue={(cfg.proxmoxUser as string) ?? ''} placeholder="root@pam" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Password / API token</label>
        <input name="proxmoxPassword" type="password" defaultValue={(cfg.proxmoxPassword as string) ?? ''} style={inputStyle} />
      </div>
    </div>
  )
}

function NasShareFields({ cfg }: { cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Share URL</label>
        <input name="shareUrl" type="text" defaultValue={(cfg.shareUrl as string) ?? ''} placeholder="smb://nas.local/backups" style={inputStyle} required />
        <p style={hintStyle}>SMB: <code>smb://host/share</code> · NFS: <code>nfs://host/path</code></p>
      </div>
      <div>
        <label style={labelStyle}>Username (optional)</label>
        <input name="shareUsername" type="text" defaultValue={(cfg.username as string) ?? ''} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Password (optional)</label>
        <input name="sharePassword" type="password" defaultValue={(cfg.password as string) ?? ''} style={inputStyle} />
      </div>
    </div>
  )
}

function WindowsFields({ cfg }: { cfg: Cfg }) {
  return (
    <div style={{ marginTop: 16 }}>
      <label style={labelStyle}>Paths to back up</label>
      <textarea
        name="paths"
        rows={3}
        defaultValue={(cfg.paths as string[] | undefined)?.join('\n') ?? ''}
        placeholder={'C:\\Users\\Administrator\nC:\\inetpub\\wwwroot'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One path per line. VSS shadow copy will be used automatically.</p>
    </div>
  )
}

export function SourceConfigSection({
  defaultSourceType,
  initialConfig,
}: {
  defaultSourceType?: string
  initialConfig?: string
}) {
  const cfg: Cfg = (() => {
    try { return JSON.parse(initialConfig ?? '{}') as Cfg } catch { return {} }
  })()
  const [selected, setSelected] = useState(defaultSourceType ?? 'filesystem')

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500 }}>
          Source type
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {SOURCE_TYPES.map(st => (
            <label
              key={st.value}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                backgroundColor: selected === st.value ? 'color-mix(in srgb, var(--surf2) 50%, var(--accent) 8%)' : 'var(--surf2)',
                border: `1px solid ${selected === st.value ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="sourceType"
                value={st.value}
                checked={selected === st.value}
                onChange={() => setSelected(st.value)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{st.label}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{st.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div style={{
        marginBottom: 20, padding: '14px 16px',
        backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
          Source configuration
        </div>
        {selected === 'filesystem'     && <FilesystemFields cfg={cfg} />}
        {selected === 'docker_volume'  && <DockerVolumeFields cfg={cfg} />}
        {selected === 'database'       && <DatabaseFields cfg={cfg} />}
        {selected === 'proxmox_vm'     && <ProxmoxFields label="VM" cfg={cfg} />}
        {selected === 'proxmox_lxc'    && <ProxmoxFields label="LXC" cfg={cfg} />}
        {selected === 'windows_system' && <WindowsFields cfg={cfg} />}
        {selected === 'nas_share'      && <NasShareFields cfg={cfg} />}
      </div>
    </>
  )
}
