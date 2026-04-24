import Link from 'next/link'
import { MonitorForm } from './monitor-form'

export default function NewMonitorPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/monitors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Monitors</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Add monitor</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Connect an external backup tool to track its status alongside your native jobs.
        </p>
      </div>
      <MonitorForm />
    </div>
  )
}
