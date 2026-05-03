'use client'

import { useState, useTransition }              from 'react'
import { testPbsConnection, TestConnectionResult } from '@/app/actions/pbs-connect'
import { Button }                                from '@/components/ui/button'
import { CopyButton }                            from '@/components/copy-button'

interface TokenOption     { id: string; authId: string; permissions: string }
interface DatastoreOption { id: string; name: string }
interface ServerInfo      { host: string; port: number; fingerprint: string }

interface Props {
  tokens:      TokenOption[]
  datastores:  DatastoreOption[]
  server:      ServerInfo | null
  serverError: string | null
}

const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }
const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '16px 20px',
  backgroundColor: 'var(--surf)',
  marginBottom: 20,
}
const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--fg-faint)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
}
const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  backgroundColor: 'var(--surf2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--fg)',
  outline: 'none',
}

function InfoRow({ label: lbl, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-faint)', width: 100, flexShrink: 0, paddingTop: 2 }}>{lbl}</span>
      <span style={{ ...mono, color: 'var(--fg)', flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{value}</span>
      <CopyButton text={value} />
    </div>
  )
}

export function ConnectClient({ tokens, datastores, server, serverError }: Props) {
  const [selectedTokenId,   setSelectedTokenId]   = useState(tokens[0]?.id ?? '')
  const [selectedDatastore, setSelectedDatastore] = useState(datastores[0]?.name ?? '')
  const [activeTab,         setActiveTab]          = useState<'cli' | 'webui'>('cli')
  const [testResult,        setTestResult]         = useState<TestConnectionResult | null>(null)
  const [isPending,         startTransition]       = useTransition()

  const selectedToken = tokens.find(t => t.id === selectedTokenId)
  const serverAddr    = server ? `${server.host}:${server.port}` : ''
  const fp            = server?.fingerprint ?? ''
  const authId        = selectedToken?.authId ?? ''
  const dsName        = selectedDatastore

  const canTest = !!selectedTokenId && !!selectedDatastore && !serverError

  const pvesmCmd = server && authId && dsName
    ? `pvesm add pbs backupos \\\n  --server ${serverAddr} \\\n  --datastore ${dsName} \\\n  --username ${authId} \\\n  --password '<paste-token-secret-here>' \\\n  --fingerprint ${fp}`
    : '(Select a token and datastore above)'

  function handleTest() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testPbsConnection({ tokenId: selectedTokenId, datastoreName: selectedDatastore })
      setTestResult(result)
    })
  }

  const noTokens      = tokens.length === 0
  const noDatastores  = datastores.length === 0

  return (
    <div style={{ maxWidth: 700, padding: '32px 0' }}>

      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>
        Connect Proxmox VE to BackupOS
      </h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Add this BackupOS instance as a Proxmox Backup Server target on your PVE host or cluster.
      </p>

      {/* Server info */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
          Server info
        </div>
        {serverError ? (
          <div style={{ padding: '10px 14px', fontSize: 13, color: '#ef4444', border: '1px solid #ef4444', borderRadius: 'var(--radius-sm)' }}>
            <strong>Could not read TLS certificate:</strong> {serverError}
            <br />
            <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4, display: 'block' }}>
              Ensure backupos-pbs has generated its cert at <code>/var/lib/backupos/pbs/cert.pem</code>.
            </span>
          </div>
        ) : (
          <>
            <InfoRow label="Server"      value={serverAddr} />
            <InfoRow label="Fingerprint" value={fp} />
          </>
        )}
      </div>

      {/* Token + datastore selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={label}>API Token</label>
          {noTokens ? (
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>
              No tokens yet.{' '}
              <a href="/pbs/tokens" style={{ color: 'var(--accent)' }}>Create one</a>
            </div>
          ) : (
            <select
              value={selectedTokenId}
              onChange={e => setSelectedTokenId(e.target.value)}
              style={selectStyle}
              disabled={!!serverError}
            >
              {tokens.map(t => (
                <option key={t.id} value={t.id}>
                  {t.authId} ({t.permissions})
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label style={label}>Datastore</label>
          {noDatastores ? (
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>
              No datastores yet.{' '}
              <a href="/pbs/datastores/new" style={{ color: 'var(--accent)' }}>Create one</a>
            </div>
          ) : (
            <select
              value={selectedDatastore}
              onChange={e => setSelectedDatastore(e.target.value)}
              style={selectStyle}
              disabled={!!serverError}
            >
              {datastores.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {(noTokens || noDatastores) && (
        <div style={{ ...card, borderColor: 'var(--accent)', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>
            {noTokens && noDatastores
              ? 'Create an API token and a datastore before configuring PVE.'
              : noTokens
              ? 'Create an API token to generate the connection configuration.'
              : 'Create a datastore to generate the connection configuration.'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {noTokens && (
              <a href="/pbs/tokens" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">Create token</Button>
              </a>
            )}
            {noDatastores && (
              <a href="/pbs/datastores/new" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">Create datastore</Button>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Configuration block */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {(['cli', 'webui'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 13, fontWeight: 500, padding: '8px 16px', cursor: 'pointer',
                border: 'none', backgroundColor: 'transparent',
                color:        activeTab === tab ? 'var(--accent-deep)' : 'var(--fg-dim)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab === 'cli' ? 'PVE CLI (pvesm)' : 'PVE Web UI'}
            </button>
          ))}
        </div>

        {activeTab === 'cli' && (
          <div>
            <div style={{ position: 'relative' }}>
              <pre style={{
                ...mono,
                padding: '12px 14px',
                backgroundColor: 'var(--surf2)',
                borderRadius: 'var(--radius-sm)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--fg)',
                margin: 0,
              }}>
                {pvesmCmd}
              </pre>
              {server && authId && dsName && (
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <CopyButton text={pvesmCmd.replace(/\\\n  /g, ' ')} />
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 10 }}>
              Replace <code style={mono}>&lt;paste-token-secret-here&gt;</code> with the secret you
              captured when creating the token. If you lost it, revoke the token and create a new one.
            </p>
          </div>
        )}

        {activeTab === 'webui' && (
          <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              <li>Open the PVE web UI as root or a Datacenter admin.</li>
              <li>
                <strong>Datacenter → Storage → Add → &quot;Proxmox Backup Server&quot;</strong>
              </li>
              <li style={{ marginTop: 8 }}>
                Fill in the fields:
                <table style={{ fontSize: 12, marginTop: 8, borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {[
                      ['ID',          'backupos (or any name)'],
                      ['Server',      serverAddr || '—'],
                      ['Username',    authId     || '—'],
                      ['Password',    'the token secret you captured at creation'],
                      ['Datastore',   dsName     || '—'],
                      ['Fingerprint', fp         || '—'],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '3px 12px 3px 0', color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{k}</td>
                        <td>
                          <span style={{ ...mono, color: 'var(--fg)' }}>{v}</span>
                          {['Server', 'Username', 'Datastore', 'Fingerprint'].includes(k ?? '') && v && v !== '—' && (
                            <span style={{ marginLeft: 8 }}><CopyButton text={v ?? ''} /></span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
              <li style={{ marginTop: 8 }}>Click <strong>Add</strong>.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Test connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button
          variant="primary"
          disabled={!canTest || isPending}
          onClick={handleTest}
        >
          {isPending ? 'Testing…' : 'Test connection'}
        </Button>
        {!canTest && !serverError && (
          <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            Select a token and datastore first
          </span>
        )}
      </div>

      {testResult && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          border:           `1px solid ${testResult.ok ? '#22c55e' : '#ef4444'}`,
          backgroundColor:  testResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          fontSize: 13,
          color: testResult.ok ? '#16a34a' : '#ef4444',
        }}>
          {testResult.ok ? (
            <>
              <strong>Connection OK.</strong> backupos-pbs version {testResult.serverVersion},
              datastore reachable, latency {testResult.latencyMs}ms.
            </>
          ) : (
            <><strong>Connection failed:</strong> {testResult.error}</>
          )}
        </div>
      )}
    </div>
  )
}
