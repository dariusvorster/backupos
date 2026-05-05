'use client'

import { useState, useEffect } from 'react'
import { useDrMode } from '@/components/dr-mode-provider'
import { File, Database, Server, X, ShieldAlert } from 'lucide-react'
import { RestoreFileWizard }     from '@/components/dr/restore-file-wizard'
import { RestoreDatabaseWizard } from '@/components/dr/restore-database-wizard'
import { RestoreHostWizard }     from '@/components/dr/restore-host-wizard'

type WizardType = 'file' | 'database' | 'host' | null

interface DrModeOverlayProps {
  jobs: { id: string; name: string }[]
}

const CARDS = [
  {
    type:  'file' as const,
    icon:  File,
    title: 'Restore a file',
    desc:  'Find and restore a specific file or directory from a recent backup snapshot.',
  },
  {
    type:  'database' as const,
    icon:  Database,
    title: 'Restore a database',
    desc:  'Restore a full database backup to a target host using the app-aware backup hook.',
  },
  {
    type:  'host' as const,
    icon:  Server,
    title: 'Restore a compose stack',
    desc:  'In-place restore of a docker-compose project from the latest successful backup run.',
  },
]

export function DrModeOverlay({ jobs }: DrModeOverlayProps) {
  const { active, toggle } = useDrMode()
  const [wizard, setWizard] = useState<WizardType>(null)

  useEffect(() => {
    if (!active) setWizard(null)
  }, [active])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      backgroundColor: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Red urgency strip */}
      <div style={{ height: 3, backgroundColor: 'var(--err)', flexShrink: 0 }} />

      {/* DR topbar */}
      <div style={{
        height: 52,
        backgroundColor: 'var(--surf)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'var(--err-dim)',
          border: '1px solid color-mix(in srgb, var(--err) 30%, transparent)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 10px',
        }}>
          <ShieldAlert size={14} color="var(--err)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--err)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            DR Mode
          </span>
        </div>
        <span style={{ fontSize: 14, color: 'var(--fg-dim)', flex: 1 }}>
          Guided Recovery
        </span>
        {wizard !== null && (
          <button
            onClick={() => setWizard(null)}
            style={{
              fontSize: 13, color: 'var(--fg-dim)',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', padding: '4px 12px', height: 30,
            }}
          >
            ← Recovery options
          </button>
        )}
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--fg-dim)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 12px', height: 30, cursor: 'pointer',
          }}
        >
          <X size={13} />
          Exit DR Mode
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '40px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {wizard === null && (
          <>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--err-dim)',
              border: '1px solid color-mix(in srgb, var(--err) 25%, transparent)',
              borderRadius: 20,
              padding: '4px 14px', marginBottom: 20,
              fontSize: 11, fontWeight: 600, color: 'var(--err)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              <ShieldAlert size={12} />
              What do you need to recover?
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', marginBottom: 8, textAlign: 'center', letterSpacing: '-0.02em' }}>
              Choose a recovery path
            </div>
            <div style={{ fontSize: 14, color: 'var(--fg-dim)', marginBottom: 40, textAlign: 'center' }}>
              All actions are recorded in the audit log with a DR mode flag.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, width: '100%', maxWidth: 860 }}>
              {CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.type}
                    onClick={() => setWizard(card.type)}
                    style={{
                      backgroundColor: 'var(--surf)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: 28, cursor: 'pointer', textAlign: 'left',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'var(--err)'
                      t.style.boxShadow = '0 0 0 3px var(--err-dim)'
                    }}
                    onMouseLeave={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'var(--border)'
                      t.style.boxShadow = 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--err-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 16,
                    }}>
                      <Icon size={20} color="var(--err)" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
                      {card.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {wizard === 'file'     && <RestoreFileWizard     jobs={jobs} onDone={() => setWizard(null)} />}
        {wizard === 'database' && <RestoreDatabaseWizard jobs={jobs} onDone={() => setWizard(null)} />}
        {wizard === 'host'     && <RestoreHostWizard     jobs={jobs} onDone={() => setWizard(null)} />}
      </div>
    </div>
  )
}
