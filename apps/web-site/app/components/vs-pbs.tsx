import type { CSSProperties } from 'react'

const rows: { label: string; plain: string; bos: string }[] = [
  { label: 'Backup scheduling',  plain: 'Manual cron',         bos: 'UI scheduler + CRON builder'    },
  { label: 'Failure alerts',     plain: 'None',                bos: 'Email + webhook notifications'  },
  { label: 'Repo health checks', plain: 'Manual restic check', bos: 'Automated check jobs'            },
  { label: 'Password storage',   plain: 'Plaintext / env var', bos: 'AES-256-GCM escrow'             },
  { label: 'Prune policies',     plain: 'Per-repo shell flags', bos: 'Policy UI, applied per job'    },
  { label: 'Dashboard',          plain: 'None',                bos: 'Multi-repo stats + dedup bar'   },
  { label: 'DR runbooks',        plain: 'DIY docs',            bos: 'Built-in restore wizards'       },
]

export function VsPbs() {
  const th: CSSProperties = {
    padding: '10px 20px', fontSize: 12, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--fg-dim)', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  }
  const td: CSSProperties = { padding: '13px 20px', fontSize: 14 }

  return (
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>
          BackupOS vs bare Restic
        </h2>
        <div style={{
          background: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Feature</th>
                <th style={th}>Bare Restic</th>
                <th style={{ ...th, color: 'var(--accent)' }}>BackupOS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border2)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{r.label}</td>
                  <td style={{ ...td, color: 'var(--fg-mute)' }}>{r.plain}</td>
                  <td style={{ ...td, color: 'var(--ok)' }}>✓ {r.bos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
