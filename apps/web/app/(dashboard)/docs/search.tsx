'use client'

import { useState, useEffect, useRef } from 'react'
import Link                             from 'next/link'
import MiniSearch                       from 'minisearch'
import { IconSearch, IconFileText }      from './icons'

interface DocEntry {
  id:      string
  title:   string
  section: string
  slug:    string
  href:    string
  excerpt: string
}

interface SearchResult {
  id:      string
  title:   string
  section: string
  href:    string
}

let _miniSearch: MiniSearch | null      = null
let _indexPromise: Promise<void> | null = null

function ensureIndex(): Promise<void> {
  if (_indexPromise) return _indexPromise
  _indexPromise = fetch('/api/docs-index')
    .then(r => r.json() as Promise<DocEntry[]>)
    .then(entries => {
      _miniSearch = new MiniSearch<DocEntry>({
        fields:        ['title', 'section', 'excerpt'],
        storeFields:   ['title', 'section', 'href'],
        searchOptions: { prefix: true, fuzzy: 0.2 },
      })
      _miniSearch.addAll(entries)
    })
  return _indexPromise
}

export function DocsSearch() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(true)
  const containerRef          = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ensureIndex().then(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!query.trim() || !_miniSearch) {
      setResults([])
      setOpen(false)
      return
    }
    const hits: SearchResult[] = _miniSearch.search(query).slice(0, 8).map(r => ({
      id:      r.id as string,
      title:   r['title'] as string,
      section: r['section'] as string,
      href:    r['href'] as string,
    }))
    setResults(hits)
    setOpen(hits.length > 0)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ position: 'relative' }}>
        {/* Search icon */}
        <span style={{
          position: 'absolute',
          left: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--fg-mute)',
          pointerEvents: 'none',
          display: 'flex',
        }}>
          <IconSearch size={13} />
        </span>
        <input
          type="search"
          placeholder={loading ? 'Loading…' : 'Search docs…'}
          disabled={loading}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          style={{
            width: '100%',
            padding: '7px 10px 7px 30px',
            fontSize: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            backgroundColor: 'var(--surf2)',
            color: 'var(--fg)',
            outline: 'none',
            boxSizing: 'border-box',
            opacity: loading ? 0.5 : 1,
            transition: 'border-color 0.15s',
          }}
        />
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% - 4px)',
          left: 14,
          right: 14,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          zIndex: 50,
          maxHeight: 340,
          overflowY: 'auto',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 0' }}>
            {results.map((r, i) => (
              <Link
                key={r.id}
                href={r.href}
                onClick={() => { setOpen(false); setQuery('') }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  textDecoration: 'none',
                  background: i === 0 ? 'rgba(245,166,35,0.05)' : 'transparent',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ flexShrink: 0, color: 'var(--fg-mute)', display: 'flex' }}><IconFileText size={15} /></span>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 1 }}>{r.section}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
