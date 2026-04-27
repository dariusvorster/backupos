'use client'

import { useState, useCallback } from 'react'

const SOURCE_TYPES = [
  { value: 'filesystem',      label: 'Filesystem',       desc: 'Directories and files on the agent host' },
  { value: 'compose_project', label: 'Compose project',  desc: 'Docker Compose stack — volumes, app-hooks, full stack backup' },
  { value: 'docker_volume',   label: 'Docker volume',    desc: 'Named Docker volume (deprecated — use Compose project)' },
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

import type { DetectedResources, ComposeProjectConfig } from '@backupos/agent-protocol'
import { ComposeProjectFields } from './compose-project-fields'

type Cfg = Record<string, unknown>

function DetectButton({ label, onDetect, loading }: {
  label: string
  onDetect: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      onClick={onDetect}
      disabled={loading}
      style={{
        fontSize: 11, padding: '3px 10px', cursor: loading ? 'wait' : 'pointer',
        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
        background: 'var(--surf2)', color: 'var(--fg-mute)',
      }}
    >
      {loading ? 'Detecting…' : `Detect ${label}`}
    </button>
  )
}

function ChecklistPicker({ name, items, saved, placeholder, hint }: {
  name: string
  items: string[]
  saved: string[]
  placeholder: string
  hint: string
}) {
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (saved.length > 0) return new Set(saved)
    return new Set(items)
  })
  const [custom, setCustom] = useState(saved.filter(s => !items.includes(s)).join('\n'))

  const toggle = (item: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(item) ? n.delete(item) : n.add(item); return n })

  const customLines = custom.split('\n').map(s => s.trim()).filter(Boolean)
  const allSelected = [...checked, ...customLines]

  return (
    <div style={{ marginTop: 8 }}>
      {allSelected.map(p => (
        <input key={p} type="hidden" name={name} value={p} />
      ))}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        overflow: 'hidden', marginBottom: 8,
      }}>
        {items.map((item, i) => (
          <label key={item} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 12px', cursor: 'pointer',
            backgroundColor: checked.has(item) ? 'color-mix(in srgb, var(--surf2) 60%, var(--accent) 8%)' : 'var(--surf2)',
            borderTop: i > 0 ? '1px solid var(--border)' : undefined,
          }}>
            <input
              type="checkbox"
              checked={checked.has(item)}
              onChange={() => toggle(item)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{item}</span>
          </label>
        ))}
      </div>
      <textarea
        rows={2}
        value={custom}
        onChange={e => setCustom(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical', fontSize: 12 }}
      />
      <p style={hintStyle}>{hint}</p>
    </div>
  )
}

function FilesystemFields({ cfg, detected }: { cfg: Cfg; detected?: DetectedResources }) {
  const mounts  = detected?.mountPoints
  const saved   = (cfg.paths as string[] | undefined) ?? []

  if (mounts && mounts.length > 0) {
    return (
      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Select paths to back up</label>
        <ChecklistPicker
          name="paths"
          items={mounts}
          saved={saved}
          placeholder="Additional paths (one per line)"
          hint="Custom paths in addition to selected ones above."
        />
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

  return (
    <div style={{ marginTop: 16 }}>
      <label style={labelStyle}>Paths to back up</label>
      <textarea
        name="paths"
        rows={4}
        defaultValue={saved.join('\n')}
        placeholder={'/home/user\n/var/www\n/etc/nginx'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One path per line. Click "Detect mount points" above to auto-discover.</p>
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

function DockerVolumeFields({ cfg, detected }: { cfg: Cfg; detected?: DetectedResources }) {
  const volumes    = detected?.dockerVolumes
  const hasDetected = detected !== undefined
  const saved      = (cfg.volumes as string[] | undefined) ?? []

  const legacyNote = (
    <div style={{
      marginTop: 12, padding: '8px 12px',
      backgroundColor: 'color-mix(in srgb, var(--accent) 6%, var(--surf2))',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
      borderRadius: 'var(--radius-sm)',
      fontSize: 12, color: 'var(--fg-mute)',
    }}>
      <strong style={{ color: 'var(--fg)' }}>Legacy.</strong>{' '}
      For new backup jobs of Docker workloads, use{' '}
      <strong style={{ color: 'var(--fg)' }}>Compose project</strong> instead — it backs up the full stack with quiescence and restore support.
    </div>
  )

  if (hasDetected && volumes && volumes.length > 0) {
    return (
      <div style={{ marginTop: 16 }}>
        {legacyNote}
        <label style={{ ...labelStyle, marginTop: 12 }}>Select volumes to back up</label>
        <ChecklistPicker
          name="volumes"
          items={volumes}
          saved={saved}
          placeholder="Additional volume names (one per line)"
          hint="Custom volume names in addition to selected ones above."
        />
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      {legacyNote}
      {hasDetected && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 8, marginBottom: 8 }}>
          No named Docker volumes found on this agent. If your containers use bind mounts, use the <strong>Filesystem</strong> source type instead.
        </div>
      )}
      <label style={labelStyle}>Volume names</label>
      <textarea
        name="volumes"
        rows={3}
        defaultValue={saved.join('\n')}
        placeholder={'postgres_data\nredis_data'}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
      />
      <p style={hintStyle}>One Docker volume name per line. Click "Detect volumes" above.</p>
    </div>
  )
}

function DatabaseFields({ cfg, detected }: { cfg: Cfg; detected?: DetectedResources }) {
  const detectedDb = detected?.databases?.[0]
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {detected?.databases && detected.databases.length > 0 && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {detected.databases.map((db, i) => (
            <span key={i} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--surf2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
              color: 'var(--fg-mute)',
            }}>{db.type} :{db.port}</span>
          ))}
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', alignSelf: 'center' }}>detected</span>
        </div>
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Database type</label>
        <select name="dbType" defaultValue={(cfg.type as string) ?? detectedDb?.type ?? 'postgresql'} style={inputStyle} key={detectedDb?.type ?? 'dbtype'}>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL / MariaDB</option>
          <option value="sqlite">SQLite</option>
          <option value="redis">Redis</option>
          <option value="mongodb">MongoDB</option>
          <option value="mssql">MS SQL Server</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Host</label>
        <input name="dbHost" type="text" defaultValue={(cfg.host as string) ?? 'localhost'} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Port</label>
        <input name="dbPort" type="number" defaultValue={(cfg.port as number) ?? detectedDb?.port ?? ''} placeholder="5432" style={inputStyle} key={detectedDb?.port ?? 'dbport'} />
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

const DETECTABLE = new Set(['filesystem', 'docker_volume', 'database'])

export function SourceConfigSection({
  defaultSourceType,
  initialConfig,
  composeError,
}: {
  defaultSourceType?: string
  initialConfig?: string
  composeError?: string
}) {
  const cfg: Cfg = (() => {
    try { return JSON.parse(initialConfig ?? '{}') as Cfg } catch { return {} }
  })()

  const composeInitialConfig: ComposeProjectConfig | undefined = (() => {
    if (defaultSourceType !== 'compose_project') return undefined
    try {
      const p = JSON.parse(initialConfig ?? '{}') as ComposeProjectConfig
      return Array.isArray(p.services) ? p : undefined
    } catch { return undefined }
  })()
  const [selected, setSelected] = useState(defaultSourceType ?? 'filesystem')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectedResources | undefined>(undefined)
  const [detectError, setDetectError] = useState<string | undefined>(undefined)

  const handleDetect = useCallback(async () => {
    const agentSelect = document.querySelector<HTMLSelectElement>('select[name="agentId"]')
    const agentId = agentSelect?.value
    if (!agentId) { setDetectError('Select an agent first'); return }
    setDetecting(true)
    setDetectError(undefined)
    try {
      const res = await fetch(`/api/agents/${agentId}/detect`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setDetectError(body.error ?? 'Detection failed')
      } else {
        setDetected(await res.json() as DetectedResources)
      }
    } catch {
      setDetectError('Network error')
    } finally {
      setDetecting(false)
    }
  }, [])

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
                onChange={() => { setSelected(st.value); setDetected(undefined); setDetectError(undefined) }}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Source configuration</div>
          {DETECTABLE.has(selected) && (
            <DetectButton
              label={selected === 'docker_volume' ? 'volumes' : selected === 'database' ? 'databases' : 'mount points'}
              onDetect={() => { void handleDetect() }}
              loading={detecting}
            />
          )}
        </div>
        {detectError && (
          <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>{detectError}</div>
        )}
        {selected === 'filesystem'      && <FilesystemFields cfg={cfg} detected={detected} />}
        {selected === 'compose_project' && (
          <ComposeProjectFields initialConfig={composeInitialConfig} serverError={composeError} />
        )}
        {selected === 'docker_volume'   && <DockerVolumeFields cfg={cfg} detected={detected} />}
        {selected === 'database'       && <DatabaseFields cfg={cfg} detected={detected} />}
        {selected === 'proxmox_vm'     && <ProxmoxFields label="VM" cfg={cfg} />}
        {selected === 'proxmox_lxc'    && <ProxmoxFields label="LXC" cfg={cfg} />}
        {selected === 'windows_system' && <WindowsFields cfg={cfg} />}
        {selected === 'nas_share'      && <NasShareFields cfg={cfg} />}
      </div>
    </>
  )
}
