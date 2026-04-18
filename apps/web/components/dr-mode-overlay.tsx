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
    title: 'Restore a whole host',
    desc:  'Full-system restore from a backup snapshot. Requires pre-restore dry-run.',
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
      backgroundColor: 'color-mix(in srgb, #0a0505 95%, #cc0000 5%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* DR topbar */}
      <div style={{
        height: 56,
        borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, #cc0000 60%)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 12, flexShrink: 0,
      }}>
        <ShieldAlert size={18} color="var(--err)" />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--err)', flex: 1 }}>
          DR Mode — Guided Recovery
        </span>
        {wizard !== null && (
          <button
            onClick={() => setWizard(null)}
            style={{
              fontSize: 13, color: 'var(--fg-mute)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            }}
          >
            ← Back to recovery options
          </button>
        )}
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--fg-mute)',
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
        flex: 1, overflowY: 'auto', padding: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {wizard === null && (
          <>
            <div style={{
              marginBottom: 8, fontSize: 12, color: 'var(--err)',
              textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500,
            }}>
              What do you need to recover?
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 40, textAlign: 'center' }}>
              Choose a recovery path
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, width: '100%', maxWidth: 860 }}>
              {CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button
                    key={card.type}
                    onClick={() => setWizard(card.type)}
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--surf) 80%, #cc0000 5%)',
                      border: '1px solid color-mix(in srgb, var(--border) 60%, #cc0000 40%)',
                      borderRadius: 'var(--radius)',
                      padding: 28, cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'var(--err)'
                      t.style.backgroundColor = 'color-mix(in srgb, var(--surf) 70%, #cc0000 10%)'
                    }}
                    onMouseLeave={e => {
                      const t = e.currentTarget
                      t.style.borderColor = 'color-mix(in srgb, var(--border) 60%, #cc0000 40%)'
                      t.style.backgroundColor = 'color-mix(in srgb, var(--surf) 80%, #cc0000 5%)'
                    }}
                  >
                    <Icon size={28} color="var(--err)" style={{ marginBottom: 16 }} />
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.5 }}>
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
