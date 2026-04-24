import Link from 'next/link'
import { enrollAgent } from '@/app/actions/agents'

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--fg)',
}

export default function NewAgentPage() {
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/agents" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Agents</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Enroll agent</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Give the agent a name, then copy the generated install command and run it on the target host.
        </p>
      </div>

      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24,
      }}>
        <form action={enrollAgent} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>Agent name</span>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. nas-01, db-server, proxmox"
              autoFocus
              style={input}
            />
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              Used to identify this host in the dashboard and backup jobs.
            </span>
          </label>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link
              href="/agents"
              style={{
                padding: '7px 16px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', color: 'var(--fg)',
                textDecoration: 'none', background: 'var(--surf2)',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              style={{
                padding: '7px 20px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
              }}
            >
              Generate token &amp; enroll
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
