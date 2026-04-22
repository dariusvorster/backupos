import type { ReactNode } from 'react'
import {
  IconFolder, IconLayers, IconBox, IconDatabase, IconZap,
  IconFileMinus, IconMonitor, IconTerminal, IconWindow,
} from './icons'

function Callout({ type, children }: { type: 'tip' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  const config = {
    tip:     { color: 'var(--ok)',     bg: 'rgba(34,197,94,0.08)',  badge: 'Tip',     icon: '✓' },
    warning: { color: 'var(--warn)',   bg: 'rgba(245,166,35,0.08)', badge: 'Warning', icon: '⚠' },
    danger:  { color: 'var(--err)',    bg: 'rgba(239,68,68,0.08)',  badge: 'Danger',  icon: '✕' },
    info:    { color: 'var(--accent)', bg: 'rgba(245,166,35,0.06)', badge: 'Note',    icon: 'i' },
  }[type]
  return (
    <div style={{
      backgroundColor: config.bg,
      borderLeft: `3px solid ${config.color}`,
      borderRadius: '0 8px 8px 0',
      padding: '14px 18px',
      margin: '24px 0',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <span style={{
        flexShrink: 0,
        marginTop: 1,
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: config.color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
      }}>{config.icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 11, color: config.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{config.badge}</p>
        <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--fg)' }}>{children}</div>
      </div>
    </div>
  )
}

export function Tip({ children }: { children: ReactNode })     { return <Callout type="tip">{children}</Callout>     }
export function Warning({ children }: { children: ReactNode }) { return <Callout type="warning">{children}</Callout> }
export function Danger({ children }: { children: ReactNode })  { return <Callout type="danger">{children}</Callout>  }
export function Note({ children }: { children: ReactNode })    { return <Callout type="info">{children}</Callout>    }

export function Steps({ children }: { children: ReactNode }) {
  return (
    <div style={{
      margin: '20px 0',
      paddingLeft: 2,
      borderLeft: '2px solid var(--border)',
    }}>
      {children}
    </div>
  )
}

type C    = { children: ReactNode }
type A    = { children: ReactNode; href?: string }
type Code = { children?: ReactNode; className?: string }

type ComparisonTableProps = {
  headers:   string[]
  rows:      string[][]
  highlight?: string
}

function cellIcon(val: string) {
  if (val === '✅') return <span style={{ color: 'var(--ok)', fontSize: 16, fontWeight: 700 }}>✓</span>
  if (val === '❌') return <span style={{ color: 'var(--err)', fontSize: 15, opacity: 0.5 }}>✕</span>
  if (val === 'partial') return <span style={{ color: 'var(--warn)', fontSize: 12, fontWeight: 600 }}>partial</span>
  if (val === '$$$') return <span style={{ color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>$$$</span>
  return <span style={{ fontSize: 13, color: 'var(--fg)' }}>{val}</span>
}

export function ComparisonTable({ headers, rows, highlight }: ComparisonTableProps) {
  return (
    <div style={{ overflowX: 'auto', margin: '24px 0', borderRadius: 12, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => {
              const isHL = h === highlight
              return (
                <th key={h} style={{
                  padding: '11px 16px',
                  textAlign: i === 0 ? 'left' : 'center',
                  fontWeight: 700,
                  fontSize: 12,
                  background: isHL ? 'rgba(245,166,35,0.12)' : 'var(--surf2)',
                  color: isHL ? 'var(--accent)' : 'var(--fg-mute)',
                  borderBottom: isHL ? '2px solid var(--accent)' : '1px solid var(--border)',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {isHL ? `⭐ ${h}` : h}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              {row.map((cell, ci) => {
                const isHL = headers[ci] === highlight
                return (
                  <td key={ci} style={{
                    padding: '10px 16px',
                    borderBottom: ri < rows.length - 1 ? '1px solid var(--border)' : 'none',
                    textAlign: ci === 0 ? 'left' : 'center',
                    background: isHL ? 'rgba(245,166,35,0.04)' : undefined,
                    fontWeight: ci === 0 ? 500 : 400,
                    color: ci === 0 ? 'var(--fg)' : undefined,
                  }}>
                    {ci === 0 ? cell : cellIcon(cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type PlanTableProps = {
  headers: string[]
  rows:    string[][]
  highlight?: string
}

export function PlanTable({ headers, rows, highlight }: PlanTableProps) {
  return (
    <div style={{ overflowX: 'auto', margin: '24px 0', display: 'flex', gap: 16 }}>
      {headers.slice(1).map((plan, pi) => {
        const isHL = plan === highlight
        return (
          <div key={plan} style={{
            flex: 1,
            border: `1px solid ${isHL ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12,
            overflow: 'hidden',
            minWidth: 180,
          }}>
            <div style={{
              padding: '14px 20px',
              background: isHL ? 'rgba(245,166,35,0.10)' : 'var(--surf2)',
              borderBottom: `1px solid ${isHL ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: isHL ? 'var(--accent)' : 'var(--fg)' }}>{plan}</div>
            </div>
            <div style={{ padding: '8px 0' }}>
              {rows.map((row, ri) => (
                <div key={ri} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 20px',
                  borderBottom: ri < rows.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--fg-mute)' }}>{row[0]}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                    {cellIcon(row[pi + 1] ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type PhaseListProps = {
  phases: { name: string; description: string; optional?: boolean }[]
}

export function PhaseList({ phases }: PhaseListProps) {
  const colors = ['var(--accent)', 'var(--fg-mute)', 'var(--ok)', 'var(--fg-mute)', 'var(--warn)']
  return (
    <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {phases.map((phase, i) => (
        <div key={phase.name} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: colors[i % colors.length],
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              flexShrink: 0,
            }}>{i + 1}</div>
            {i < phases.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 24, background: 'var(--border)', margin: '2px 0' }} />
            )}
          </div>
          <div style={{ paddingBottom: i < phases.length - 1 ? 20 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{phase.name}</span>
              {phase.optional && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px',
                  borderRadius: 4, background: 'var(--surf2)',
                  color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>optional</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.6 }}>{phase.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

type SourceGridProps = {
  sources: { type: string; icon: string; notes: string }[]
}

export function SourceGrid({ sources }: SourceGridProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
      margin: '24px 0',
    }}>
      {sources.map(s => (
        <div key={s.type} style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          background: 'var(--surf)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{s.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>{s.type}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.55 }}>{s.notes}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Zero-prop wrappers — data lives here, not in MDX (next-mdx-remote can't reliably pass complex array props)
export function FeatureComparison() {
  return (
    <ComparisonTable
      highlight="BackupOS"
      headers={['Feature', 'BackupOS', 'PBS', 'Raw Restic', 'Veeam']}
      rows={[
        ['Web UI',                  '✅', '✅', '❌', '✅'],
        ['Linux sources',           '✅', '✅', '✅', '✅'],
        ['Windows sources',         '✅', '❌', '✅', '✅'],
        ['Database-aware backup',   '✅', '❌', '❌', '✅'],
        ['Restore verification',    '✅', '❌', '❌', '✅'],
        ['Cost forecasting',        '✅', '❌', '❌', '❌'],
        ['DR Mode / restore specs', '✅', '❌', '❌', 'partial'],
        ['Self-hosted',             '✅', '✅', '✅', '✅'],
        ['Open source',             '✅', '✅', '✅', '❌'],
        ['Price',                   'Free', 'Free', 'Free', '$$$'],
      ]}
    />
  )
}

export function PlanComparison() {
  return (
    <PlanTable
      highlight="Teams"
      headers={['', 'Solo', 'Teams']}
      rows={[
        ['Agents',              'Up to 5',  'Unlimited'],
        ['Users',               '1',        'Up to 20'],
        ['Audit log retention', '90 days',  '7 years'],
        ['SSO',                 '❌',       '✅'],
        ['Price',               'Free',     '$12/month'],
      ]}
    />
  )
}

export function JobPhases() {
  return (
    <PhaseList
      phases={[
        { name: 'Pre-flight',   description: 'Checks: disk space on source, source path reachable, repository accessible and unlocked.' },
        { name: 'Pre-hook',     description: 'Optional script or HTTP call before the backup starts. Use to quiesce a database or notify a monitoring system.', optional: true },
        { name: 'Backup',       description: 'Restic backup execution — deduplicates, compresses, and encrypts data to the target repository.' },
        { name: 'Post-hook',    description: 'Optional script or HTTP call after backup completes. Use to resume services or send a success notification.', optional: true },
        { name: 'Verification', description: 'Optional: restores a file from the new snapshot to confirm it is usable. Fails the run if the restore fails.', optional: true },
      ]}
    />
  )
}

export function SourceTypes() {
  const sources: { type: string; Icon: React.ComponentType<{ size?: number }>; notes: string }[] = [
    { type: 'Filesystem',           Icon: IconFolder,   notes: 'Any path accessible to the agent. Supports include/exclude glob patterns.' },
    { type: 'Docker volume',        Icon: IconLayers,   notes: 'Named Docker volumes. Quiesces dependent containers before backup.' },
    { type: 'Docker container',     Icon: IconBox,      notes: 'App-consistent: pauses container, backs up its volumes, then resumes.' },
    { type: 'PostgreSQL',           Icon: IconDatabase, notes: 'Runs pg_dump before backup. Credentials stored encrypted.' },
    { type: 'MySQL / MariaDB',      Icon: IconDatabase, notes: 'Runs mysqldump before backup. Supports databases or individual tables.' },
    { type: 'Redis',                Icon: IconZap,      notes: 'Sends BGSAVE and waits for completion before snapshotting the RDB file.' },
    { type: 'SQLite',               Icon: IconFileMinus,notes: 'File-copy with WAL checkpoint to ensure a consistent state.' },
    { type: 'Proxmox VM',           Icon: IconMonitor,  notes: 'Via Proxmox API. No in-guest agent required. Supports live snapshots.' },
    { type: 'Proxmox LXC',          Icon: IconTerminal, notes: 'Via Proxmox API. Backs up container filesystem and config.' },
    { type: 'Windows system (VSS)', Icon: IconWindow,   notes: 'Volume Shadow Copy Service for consistent Windows system backups.' },
  ]
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
      margin: '24px 0',
    }}>
      {sources.map(s => (
        <div key={s.type} style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          background: 'var(--surf)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(245,166,35,0.10)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <s.Icon size={16} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>{s.type}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.55 }}>{s.notes}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function GlossaryTable() {
  const terms: { term: string; def: string }[] = [
    { term: 'Agent',         def: 'The process running on a source machine that executes backup jobs. A single binary supports Linux and Windows.' },
    { term: 'Repository',    def: 'A Restic-compatible storage location (R2 bucket, B2 bucket, local path). Encrypted at rest.' },
    { term: 'Job',           def: 'A configured backup task: one source, one repository, one schedule, optional hooks.' },
    { term: 'Run',           def: 'A single execution of a job. Has phases: pre-flight → pre-hook → backup → post-hook → (optional) verification.' },
    { term: 'Source',        def: 'What gets backed up. Types: filesystem path, Docker volume, Docker container, PostgreSQL, MySQL, Redis, SQLite, Proxmox VM, Proxmox LXC, Windows system (VSS).' },
    { term: 'Snapshot',      def: 'An immutable point-in-time copy of the source, created by Restic. Deduplicated and encrypted.' },
    { term: 'Tag',           def: 'A string label attached to a snapshot (e.g. pre-migration, v2.3.0). Used for filtering and retention policy overrides.' },
    { term: 'Pin',           def: 'Marks a snapshot as protected. Pinned snapshots are excluded from forget/prune runs.' },
    { term: 'Hold',          def: 'Like a pin but temporary. Used during migrations: set a hold, do the work, release the hold.' },
    { term: 'Pre-flight',    def: 'A set of checks run before a backup: disk space, source reachable, repository accessible, last run status.' },
    { term: 'Hook',          def: 'A script or HTTP call executed before or after a backup run. Common uses: quiesce a database before backup, send a webhook after completion.' },
    { term: 'Restore spec',  def: 'A declarative YAML file describing how to recover a system or service step-by-step. Used in DR Mode.' },
    { term: 'DR Mode',       def: 'A guided recovery interface. Activated manually or by a critical alert. Presents restore specs as a checklist.' },
    { term: 'Verification',  def: 'A scheduled test that actually restores data from a snapshot and validates the result. Proves the backup is usable.' },
    { term: 'Monitor',       def: 'Read-only observation of a third-party backup system (PBS, Borg, Restic scripts) without managing it.' },
    { term: 'Health score',  def: 'A 0–100 score (A–F letter grade) per agent or repository, computed from recent run success rate, verification results, and snapshot freshness.' },
    { term: 'Escrow',        def: "Optional encrypted backup of a repository's encryption password, recoverable via a master passphrase. Prevents permanent data loss if the password is forgotten." },
    { term: 'Audit log',     def: 'A tamper-evident log of all configuration changes and security events, linked by SHA-256 hash chain.' },
    { term: 'Operational log', def: 'Structured, per-component log stream for debugging and observability. Separate from the audit log.' },
    { term: 'API token',     def: 'A long-lived credential for programmatic access to the BackupOS API. Scoped to read-only or read-write.' },
  ]
  return (
    <div style={{ margin: '24px 0', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        background: 'var(--surf2)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 0',
      }}>
        <div style={{ width: 160, flexShrink: 0, padding: '4px 16px', fontSize: 11, fontWeight: 700, color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Term</div>
        <div style={{ flex: 1, padding: '4px 16px', fontSize: 11, fontWeight: 700, color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Definition</div>
      </div>
      {terms.map((item, i) => (
        <div key={item.term} style={{
          display: 'flex',
          background: i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
          borderBottom: i < terms.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{
            width: 160,
            flexShrink: 0,
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--accent)',
            borderRight: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
          }}>
            {item.term}
          </div>
          <div style={{ flex: 1, padding: '10px 16px', fontSize: 13, color: 'var(--fg)', lineHeight: 1.65 }}>
            {item.def}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RunPhases() {
  return <JobPhases />
}

export function StepTypes() {
  const types = [
    { type: 'restore_file',     desc: 'Restore a file or directory from a snapshot to the agent.' },
    { type: 'restore_database', desc: 'Restore a database dump from a snapshot and reload it.' },
    { type: 'run_hook',         desc: 'Execute a script on an agent (e.g. restart a service).' },
    { type: 'notify',           desc: 'Send a notification via webhook or email.' },
    { type: 'manual',           desc: 'A human-in-the-loop step with written instructions.' },
  ]
  return (
    <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {types.map(t => (
        <div key={t.type} style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '11px 16px',
          background: 'var(--surf)',
        }}>
          <code style={{
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'rgba(245,166,35,0.08)',
            border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 5,
            padding: '3px 8px',
            minWidth: 148,
            display: 'inline-block',
          }}>{t.type}</code>
          <span style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.6 }}>{t.desc}</span>
        </div>
      ))}
    </div>
  )
}

export function HealthFactors() {
  const factors = [
    { name: 'Recent run success rate', weight: 40, desc: 'Percentage of runs that succeeded in the last 30 days.' },
    { name: 'Snapshot freshness',      weight: 30, desc: 'How recently the last successful snapshot was taken.' },
    { name: 'Verification results',    weight: 20, desc: 'Pass rate of restore verification tests.' },
    { name: 'Pre-flight pass rate',    weight: 10, desc: 'Percentage of pre-flights that passed.' },
  ]
  return (
    <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {factors.map(f => (
        <div key={f.name} style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 18px',
          background: 'var(--surf)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>{f.name}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{f.weight}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 4, marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${f.weight}%`, background: 'var(--accent)', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', lineHeight: 1.55 }}>{f.desc}</div>
        </div>
      ))}
    </div>
  )
}

export function HealthGrades() {
  const grades = [
    { range: '90–100', grade: 'A', color: 'var(--ok)' },
    { range: '80–89',  grade: 'B', color: '#4ade80' },
    { range: '70–79',  grade: 'C', color: 'var(--warn)' },
    { range: '60–69',  grade: 'D', color: '#fb923c' },
    { range: '0–59',   grade: 'F', color: 'var(--err)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, margin: '24px 0', flexWrap: 'wrap' }}>
      {grades.map(g => (
        <div key={g.grade} style={{
          flex: 1,
          minWidth: 80,
          border: `1px solid ${g.color}`,
          borderRadius: 10,
          padding: '16px 12px',
          textAlign: 'center',
          background: `color-mix(in srgb, ${g.color} 8%, transparent)`,
        }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: g.color, lineHeight: 1 }}>{g.grade}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{g.range}</div>
        </div>
      ))}
    </div>
  )
}

export function RetentionPolicy() {
  const rows = [
    { setting: 'Keep last N',      example: '7',         effect: 'Always keep the 7 most recent snapshots' },
    { setting: 'Keep daily for',   example: '30 days',   effect: 'Keep one snapshot per day for 30 days' },
    { setting: 'Keep weekly for',  example: '8 weeks',   effect: 'Keep one per week for 8 weeks' },
    { setting: 'Keep monthly for', example: '12 months', effect: 'Keep one per month for 12 months' },
    { setting: 'Keep yearly',      example: '3',         effect: 'Keep one per year for 3 years' },
  ]
  return (
    <div style={{ overflowX: 'auto', margin: '24px 0', borderRadius: 10, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surf2)' }}>
            {['Setting', 'Example', 'Effect'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-mute)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.setting} style={{ background: i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              <td style={{ padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{r.setting}</td>
              <td style={{ padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.example}</td>
              <td style={{ padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--fg-mute)' }}>{r.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AlertTriggers() {
  const triggers = [
    { trigger: 'Job failed',          example: 'Any job in FAILED status',              color: 'var(--err)' },
    { trigger: 'No recent backup',    example: 'No snapshot in the last 25 hours',      color: 'var(--warn)' },
    { trigger: 'Storage threshold',   example: 'Repository > 80% of budget',            color: 'var(--warn)' },
    { trigger: 'Verification failed', example: 'A restore test returned FAILED',        color: 'var(--err)' },
    { trigger: 'Agent disconnected',  example: 'Agent offline > 1 hour',                color: 'var(--err)' },
  ]
  return (
    <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {triggers.map(t => (
        <div key={t.trigger} style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '11px 16px',
          background: 'var(--surf)',
        }}>
          <span style={{
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: t.color,
          }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>{t.trigger}</span>
            <span style={{ fontSize: 13, color: 'var(--fg-mute)', marginLeft: 12 }}>{t.example}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RepoFields() {
  const fields = [
    { field: 'Name',                label: false, value: 'Any friendly name, e.g. "R2 homelab"' },
    { field: 'Backend',             label: false, value: 'S3 / R2' },
    { field: 'Endpoint',            label: false, value: 'https://<account-id>.r2.cloudflarestorage.com' },
    { field: 'Bucket',              label: false, value: 'your bucket name' },
    { field: 'Access key ID',       label: false, value: 'from step 1' },
    { field: 'Secret access key',   label: false, value: 'from step 1' },
    { field: 'Encryption password', label: true,  value: 'choose a strong, unique password — store it safely' },
  ]
  return (
    <div style={{ margin: '24px 0', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {fields.map((f, i) => (
        <div key={f.field} style={{
          display: 'flex',
          gap: 0,
          borderBottom: i < fields.length - 1 ? '1px solid var(--border)' : 'none',
          background: f.label ? 'rgba(245,166,35,0.05)' : (i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent'),
        }}>
          <div style={{
            width: 180,
            flexShrink: 0,
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: 13,
            color: f.label ? 'var(--warn)' : 'var(--fg)',
            borderRight: '1px solid var(--border)',
          }}>{f.field}</div>
          <div style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: f.field === 'Endpoint' ? 12 : 13,
            color: f.label ? 'var(--warn)' : 'var(--fg-mute)',
            fontFamily: f.field === 'Endpoint' ? 'var(--font-mono)' : undefined,
          } as React.CSSProperties}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

export function OtherBackends() {
  const backends = [
    { name: 'Backblaze B2', endpoint: 'b2:<bucket-name>' },
    { name: 'AWS S3',       endpoint: 's3:s3.amazonaws.com/<bucket>' },
    { name: 'MinIO (local)',endpoint: 's3:http://minio:9000/<bucket>' },
    { name: 'Local path',   endpoint: '/mnt/nas/backups' },
  ]
  return (
    <div style={{ overflowX: 'auto', margin: '24px 0', borderRadius: 10, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surf2)' }}>
            {['Backend', 'Endpoint format'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-mute)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {backends.map((b, i) => (
            <tr key={b.name} style={{ background: i % 2 !== 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              <td style={{ padding: '10px 16px', borderBottom: i < backends.length - 1 ? '1px solid var(--border)' : 'none', fontWeight: 500, color: 'var(--fg)' }}>{b.name}</td>
              <td style={{ padding: '10px 16px', borderBottom: i < backends.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.endpoint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMdxComponents(): Record<string, any> {
  return {
    Tip, Warning, Danger, Note, Steps,
    ComparisonTable, PlanTable, PhaseList, SourceGrid,
    FeatureComparison, PlanComparison, JobPhases, SourceTypes,
    GlossaryTable, RunPhases, StepTypes,
    HealthFactors, HealthGrades,
    RetentionPolicy, AlertTriggers, RepoFields, OtherBackends,
    h1: ({ children }: C) => (
      <h1 style={{
        fontSize: 30,
        fontWeight: 700,
        lineHeight: 1.2,
        color: 'var(--fg)',
        margin: '0 0 20px',
        paddingBottom: 20,
        borderBottom: '1px solid var(--border)',
        letterSpacing: '-0.02em',
      }}>{children}</h1>
    ),
    h2: ({ children }: C) => (
      <h2 style={{
        fontSize: 19,
        fontWeight: 600,
        lineHeight: 1.3,
        color: 'var(--fg)',
        margin: '44px 0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          width: 4,
          height: 22,
          background: 'var(--accent)',
          borderRadius: 2,
          display: 'inline-block',
          flexShrink: 0,
        }} />
        {children}
      </h2>
    ),
    h3: ({ children }: C) => (
      <h3 style={{
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.4,
        color: 'var(--fg)',
        margin: '32px 0 10px',
      }}>{children}</h3>
    ),
    h4: ({ children }: C) => (
      <h4 style={{
        fontSize: 13,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--fg-mute)',
        margin: '24px 0 8px',
      }}>{children}</h4>
    ),
    p:  ({ children }: C) => (
      <p style={{ margin: '0 0 18px', lineHeight: 1.8, color: 'var(--fg)', fontSize: 14 }}>{children}</p>
    ),
    ul: ({ children }: C) => (
      <ul style={{ margin: '0 0 18px', paddingLeft: 22, lineHeight: 1.75 }}>{children}</ul>
    ),
    ol: ({ children }: C) => (
      <ol style={{ margin: '0 0 18px', paddingLeft: 22, lineHeight: 1.75 }}>{children}</ol>
    ),
    li: ({ children }: C) => (
      <li style={{ margin: '6px 0', fontSize: 14, color: 'var(--fg)' }}>{children}</li>
    ),
    code: ({ children, className }: Code) => {
      if (className) {
        return (
          <code className={className} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65 }}>
            {children}
          </code>
        )
      }
      return (
        <code style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.84em',
          background: 'var(--surf2)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '1px 6px',
          color: 'var(--accent)',
        }}>{children}</code>
      )
    },
    pre: ({ children }: C) => (
      <div style={{ position: 'relative', margin: '20px 0' }}>
        <pre style={{
          background: 'var(--surf2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '18px 22px',
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.65,
          fontFamily: 'var(--font-mono)',
          margin: 0,
        }}>{children}</pre>
      </div>
    ),
    blockquote: ({ children }: C) => (
      <blockquote style={{
        borderLeft: '3px solid var(--accent)',
        margin: '20px 0',
        padding: '12px 18px',
        background: 'rgba(245,166,35,0.05)',
        borderRadius: '0 8px 8px 0',
        fontStyle: 'italic',
        color: 'var(--fg-mute)',
      }}>{children}</blockquote>
    ),
    table: ({ children }: C) => (
      <div style={{ overflowX: 'auto', margin: '24px 0', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
      </div>
    ),
    thead: ({ children }: C) => (
      <thead style={{ background: 'var(--surf2)' }}>{children}</thead>
    ),
    th: ({ children }: C) => (
      <th style={{
        padding: '10px 16px',
        textAlign: 'left',
        fontWeight: 600,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--fg-mute)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
      }}>{children}</th>
    ),
    td: ({ children }: C) => (
      <td style={{
        padding: '11px 16px',
        borderBottom: '1px solid var(--border)',
        color: 'var(--fg)',
        verticalAlign: 'top',
        lineHeight: 1.6,
      }}>{children}</td>
    ),
    strong: ({ children }: C) => (
      <strong style={{ fontWeight: 600, color: 'var(--fg)' }}>{children}</strong>
    ),
    a: ({ href, children }: A) => (
      <a href={href} style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {children}
      </a>
    ),
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '36px 0' }} />,
  }
}
