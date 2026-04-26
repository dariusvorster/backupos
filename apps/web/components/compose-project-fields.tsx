'use client'

import { useState } from 'react'

type QuiescenceType = 'none' | 'pause' | 'stop' | 'apphook'
type ApphookType = 'postgres' | 'mysql' | 'redis' | 'sqlite'

interface VolumeInfo { name?: string; target: string }

interface ServiceState {
  name: string
  image: string
  containerStatus: string
  quiescence: QuiescenceType
  apphookType: ApphookType
  apphookUsername: string
  apphookPasswordEnv: string
  apphookDatabase: string
  apphookHost: string
  apphookPort: string
  includedVolumes: string[]
  allVolumes: VolumeInfo[]
  binds: string[]
}

interface ListingService {
  name: string; image: string; containerStatus: string
  volumes: Array<{ type: string; name?: string; target: string }>
  binds: string[]
  defaultQuiescence?: string; defaultApphookType?: string
}

interface Listing { name: string; composeFilePath?: string; services: ListingService[] }

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500,
}

const APPHOOK_DEFAULTS: Record<ApphookType, { port: number; database: string }> = {
  postgres: { port: 5432, database: 'postgres' },
  mysql:    { port: 3306, database: '' },
  redis:    { port: 6379, database: '' },
  sqlite:   { port: 0,    database: '' },
}

function buildConfig(projectName: string, listing: Listing, services: ServiceState[]) {
  return {
    projectName,
    composeFilePath: listing.composeFilePath,
    services: services.map(s => ({
      serviceName: s.name,
      included: true,
      quiescence: s.quiescence,
      apphookType:   s.quiescence === 'apphook' ? s.apphookType  : undefined,
      apphookConfig: s.quiescence === 'apphook' ? {
        username:    s.apphookUsername    || undefined,
        passwordEnv: s.apphookPasswordEnv || undefined,
        database:    s.apphookDatabase    || undefined,
        host:        s.apphookHost        || undefined,
        port:        s.apphookPort ? parseInt(s.apphookPort) : undefined,
      } : undefined,
      includedVolumes: s.includedVolumes,
      includedBindMounts: [],
    })),
    includeComposeFile: true,
    includeEnvFiles: true,
    redactSecretsInEnvFiles: true,
    includeContainerLabels: true,
    includeNetworkMetadata: true,
  }
}

function initService(s: ListingService): ServiceState {
  const q = (s.defaultQuiescence ?? 'stop') as QuiescenceType
  const at = (s.defaultApphookType ?? 'postgres') as ApphookType
  const d = APPHOOK_DEFAULTS[at] ?? APPHOOK_DEFAULTS.postgres
  return {
    name: s.name, image: s.image, containerStatus: s.containerStatus,
    quiescence: q, apphookType: at,
    apphookUsername: '', apphookPasswordEnv: '',
    apphookDatabase: d.database, apphookHost: '',
    apphookPort: d.port > 0 ? String(d.port) : '',
    includedVolumes: s.volumes.filter(v => v.type === 'volume' && v.name).map(v => v.name!),
    allVolumes: s.volumes.filter(v => v.type === 'volume').map(v => ({ name: v.name, target: v.target })),
    binds: s.binds,
  }
}

export function ComposeProjectFields() {
  const [projectName, setProjectName] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | undefined>()
  const [listing, setListing] = useState<Listing | undefined>()
  const [services, setServices] = useState<ServiceState[]>([])

  const discover = async () => {
    const agentId = document.querySelector<HTMLSelectElement>('select[name="agentId"]')?.value
    if (!agentId) { setDiscoverError('Select an agent first'); return }
    if (!projectName.trim()) { setDiscoverError('Enter a project name'); return }
    setDiscovering(true); setDiscoverError(undefined)
    try {
      const res = await fetch(`/api/agents/${agentId}/list-compose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: projectName.trim() }),
      })
      const body = await res.json() as Listing | { error?: string }
      if (!res.ok) { setDiscoverError((body as { error?: string }).error ?? 'Discovery failed'); return }
      const l = body as Listing
      setListing(l)
      setServices(l.services.map(initService))
    } catch { setDiscoverError('Network error — check the agent is connected') }
    finally { setDiscovering(false) }
  }

  const update = (idx: number, patch: Partial<ServiceState>) =>
    setServices(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))

  const toggleVol = (idx: number, name: string) =>
    setServices(prev => prev.map((s, i) => {
      if (i !== idx) return s
      const has = s.includedVolumes.includes(name)
      return { ...s, includedVolumes: has ? s.includedVolumes.filter(v => v !== name) : [...s.includedVolumes, name] }
    }))

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Compose project name</label>
          <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
            placeholder="proxyos-app" style={inp} />
        </div>
        <button type="button" onClick={() => { void discover() }} disabled={discovering} style={{
          padding: '8px 16px', cursor: discovering ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)',
          background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500,
        }}>
          {discovering ? 'Discovering…' : listing ? 'Re-discover' : 'Discover services'}
        </button>
      </div>

      {discoverError && (
        <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 8, padding: '6px 10px',
          background: 'color-mix(in srgb, var(--err) 10%, transparent)', borderRadius: 'var(--radius-sm)' }}>
          {discoverError}
        </div>
      )}

      {services.map((svc, idx) => (
        <div key={svc.name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surf3)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{svc.name}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{svc.image} · {svc.containerStatus}</div>
          </div>

          <div style={{ padding: '12px 14px' }}>
            <label style={lbl}>Quiescence</label>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              {(['none', 'pause', 'stop', 'apphook'] as QuiescenceType[]).map(q => (
                <label key={q} style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" name={`quiescence_${svc.name}`} value={q}
                    checked={svc.quiescence === q} onChange={() => update(idx, { quiescence: q })} />
                  {q.charAt(0).toUpperCase() + q.slice(1)}
                </label>
              ))}
            </div>

            {svc.quiescence === 'apphook' && (
              <div style={{ padding: '10px 12px', background: 'var(--surf2)', borderRadius: 'var(--radius-sm)', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Apphook type</label>
                  <select value={svc.apphookType} style={inp} onChange={e => {
                    const at = e.target.value as ApphookType
                    const d = APPHOOK_DEFAULTS[at] ?? APPHOOK_DEFAULTS.postgres
                    update(idx, { apphookType: at, apphookPort: d.port > 0 ? String(d.port) : '', apphookDatabase: d.database })
                  }}>
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL / MariaDB</option>
                    <option value="redis">Redis</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Username</label>
                  <input type="text" value={svc.apphookUsername} placeholder="postgres" style={inp}
                    onChange={e => update(idx, { apphookUsername: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>Password env var</label>
                  <input type="text" value={svc.apphookPasswordEnv} placeholder="POSTGRES_PASSWORD" style={inp}
                    onChange={e => update(idx, { apphookPasswordEnv: e.target.value })} />
                </div>
                {svc.apphookType !== 'redis' && svc.apphookType !== 'sqlite' && (
                  <div>
                    <label style={lbl}>Database</label>
                    <input type="text" value={svc.apphookDatabase} placeholder="mydb" style={inp}
                      onChange={e => update(idx, { apphookDatabase: e.target.value })} />
                  </div>
                )}
                {svc.apphookType !== 'sqlite' && (
                  <>
                    <div>
                      <label style={lbl}>Host (optional)</label>
                      <input type="text" value={svc.apphookHost} placeholder="127.0.0.1" style={inp}
                        onChange={e => update(idx, { apphookHost: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Port</label>
                      <input type="text" value={svc.apphookPort} style={inp}
                        onChange={e => update(idx, { apphookPort: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            )}

            {svc.allVolumes.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Volumes ({svc.includedVolumes.length} of {svc.allVolumes.length} selected)</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  {svc.allVolumes.map((v, vi) => {
                    const name = v.name ?? `vol-${vi}`
                    const checked = svc.includedVolumes.includes(name)
                    return (
                      <label key={name} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: 'pointer',
                        borderTop: vi > 0 ? '1px solid var(--border)' : undefined,
                        background: checked ? 'color-mix(in srgb, var(--surf2) 60%, var(--accent) 8%)' : 'var(--surf2)',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleVol(idx, name)}
                          style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 'auto' }}>→ {v.target}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {svc.binds.length > 0 && (
              <div>
                <label style={{ ...lbl, color: 'var(--fg-dim)' }}>Bind mounts (not backed up)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {svc.binds.map(b => (
                    <span key={b} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 6px',
                      background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      color: 'var(--fg-dim)' }}>{b}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <input type="hidden" name="composeConfig"
        value={listing ? JSON.stringify(buildConfig(projectName.trim(), listing, services)) : ''} />
    </div>
  )
}
