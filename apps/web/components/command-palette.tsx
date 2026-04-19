'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandPalette } from '@/components/command-palette-provider'
import { search } from '@/app/actions/search'
import type { SearchResult, ResultType } from '@/lib/search'
import {
  Search, X, Briefcase, Database, Cpu, Archive,
  FileText, BarChart2, Bell, Clock, Plus,
} from 'lucide-react'

// ─── Static commands ───────────────────────────────────────────────────────────

interface CommandItem {
  id:        string
  label:     string
  sublabel:  string
  url:       string
  isCommand: true
}

const COMMANDS: CommandItem[] = [
  { id: 'cmd-new-job',   label: 'Create job',         sublabel: 'New backup job',        url: '/jobs/new',           isCommand: true },
  { id: 'cmd-new-agent', label: 'Enrol agent',        sublabel: 'Connect a new agent',   url: '/agents/new',         isCommand: true },
  { id: 'cmd-new-repo',  label: 'Add repository',     sublabel: 'New backup target',     url: '/repositories/new',   isCommand: true },
  { id: 'cmd-bandwidth', label: 'Bandwidth settings', sublabel: 'Manage rate limits',    url: '/settings/bandwidth', isCommand: true },
  { id: 'cmd-settings',  label: 'Settings',           sublabel: 'App configuration',     url: '/settings',           isCommand: true },
]

// ─── Icon map ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ResultType, (props: { size: number; color: string }) => React.ReactNode> = {
  job:         Briefcase,
  repository:  Database,
  agent:       Cpu,
  snapshot:    Archive,
  restoreSpec: FileText,
  monitor:     BarChart2,
  alertRule:   Bell,
  auditEvent:  Clock,
}

const TYPE_LABEL: Record<ResultType, string> = {
  job:         'Jobs',
  repository:  'Repositories',
  agent:       'Agents',
  snapshot:    'Snapshots',
  restoreSpec: 'Restore specs',
  monitor:     'Monitors',
  alertRule:   'Alert rules',
  auditEvent:  'Audit events',
}

// ─── Recent searches ──────────────────────────────────────────────────────────

const RECENT_KEY = 'backupos:recent-searches'
const MAX_RECENT = 5

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}

function saveRecent(query: string): void {
  const prev = loadRecent().filter(q => q !== query)
  localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...prev].slice(0, MAX_RECENT)))
}

// ─── Flat item type for keyboard nav ─────────────────────────────────────────

type FlatItem =
  | { kind: 'command'; item: CommandItem }
  | { kind: 'result';  item: SearchResult }
  | { kind: 'recent';  query: string }

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { open, closePalette }       = useCommandPalette()
  const [query,    setQuery]         = useState('')
  const [results,  setResults]       = useState<SearchResult[]>([])
  const [recent,   setRecent]        = useState<string[]>([])
  const [selected, setSelected]      = useState(0)
  const [isPending, startTransition] = useTransition()
  const inputRef                     = useRef<HTMLInputElement>(null)
  const router                       = useRouter()

  // Load recent on open
  useEffect(() => {
    if (open) {
      setRecent(loadRecent())
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await search(query.trim())
        setResults(r)
        setSelected(0)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Build flat list for keyboard nav
  const filteredCommands = COMMANDS.filter(c =>
    query.trim().length === 0 ||
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.sublabel.toLowerCase().includes(query.toLowerCase())
  )

  const flatItems: FlatItem[] = [
    ...filteredCommands.map(item => ({ kind: 'command' as const, item })),
    ...results.map(item         => ({ kind: 'result'  as const, item })),
    ...(query.trim().length === 0 ? recent.map(q => ({ kind: 'recent' as const, query: q })) : []),
  ]

  const navigate = useCallback((item: FlatItem) => {
    if (item.kind === 'recent') { setQuery(item.query); return }
    if (query.trim().length >= 2) saveRecent(query.trim())
    closePalette()
    router.push(item.kind === 'command' ? item.item.url : item.item.url)
  }, [query, closePalette, router])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape')    { closePalette(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatItems.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && flatItems[selected]) { e.preventDefault(); navigate(flatItems[selected]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, flatItems, selected, navigate, closePalette])

  if (!open) return null

  // Group results by type for display
  const typeOrder: ResultType[] = ['job', 'repository', 'agent', 'snapshot', 'restoreSpec', 'monitor', 'alertRule', 'auditEvent']
  const grouped = typeOrder
    .map(type => ({ type, items: results.filter(r => r.type === type) }))
    .filter(g => g.items.length > 0)

  // Track index for highlight — incremented as we render items
  let navIdx = 0

  return (
    <div
      onClick={closePalette}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 640,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: 520,
        }}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', height: 52, flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <Search size={16} color="var(--fg-dim)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs, repositories, agents…"
            style={{
              flex: 1, fontSize: 15, color: 'var(--fg)',
              background: 'none', border: 'none', outline: 'none',
              caretColor: 'var(--accent)',
            }}
          />
          {isPending && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Searching…</span>
          )}
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 2, display: 'flex' }}
            >
              <X size={14} />
            </button>
          )}
          <kbd style={{
            fontSize: 11, color: 'var(--fg-faint)',
            backgroundColor: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
          }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Commands */}
          {filteredCommands.length > 0 && (
            <section>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Commands
              </div>
              {filteredCommands.map(cmd => {
                const idx = navIdx++
                const isSelected = idx === selected
                return (
                  <button
                    key={cmd.id}
                    onClick={() => navigate({ kind: 'command', item: cmd })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={13} color="var(--fg-mute)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{cmd.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{cmd.sublabel}</div>
                    </div>
                    {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                  </button>
                )
              })}
            </section>
          )}

          {/* Entity results grouped by type */}
          {grouped.map(group => {
            const Icon = TYPE_ICON[group.type]
            return (
              <section key={group.type}>
                <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {TYPE_LABEL[group.type]}
                </div>
                {group.items.map(item => {
                  const idx = navIdx++
                  const isSelected = idx === selected
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate({ kind: 'result', item })}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} color="var(--fg-mute)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sublabel}</div>
                      </div>
                      {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                    </button>
                  )
                })}
              </section>
            )
          })}

          {/* Recent searches (when query is empty) */}
          {query.trim().length === 0 && recent.length > 0 && (
            <section>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Recent searches
              </div>
              {recent.map(q => {
                const idx = navIdx++
                const isSelected = idx === selected
                return (
                  <button
                    key={q}
                    onClick={() => navigate({ kind: 'recent', query: q })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', background: isSelected ? 'var(--surf2)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={13} color="var(--fg-mute)" />
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-mute)' }}>{q}</div>
                    {isSelected && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>↵</span>}
                  </button>
                )
              })}
            </section>
          )}

          {/* No results */}
          {query.trim().length >= 2 && results.length === 0 && !isPending && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Empty state */}
          {query.trim().length === 0 && recent.length === 0 && filteredCommands.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)' }}>
              Type to search jobs, repos, agents, and more
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--fg-faint)', flexShrink: 0,
        }}>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↵</kbd> select</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>Esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  )
}
