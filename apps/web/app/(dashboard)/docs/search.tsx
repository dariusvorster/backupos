'use client'

import { useState, useEffect, useRef } from 'react'
import Link                             from 'next/link'
import MiniSearch                       from 'minisearch'

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

let _miniSearch: MiniSearch | null  = null
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
    <div ref={containerRef} style={{ position: 'relative', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <input
        type="search"
        placeholder={loading ? 'Loading index…' : 'Search docs…'}
        disabled={loading}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 12,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--surf2)', color: 'var(--fg)', outline: 'none',
          boxSizing: 'border-box', opacity: loading ? 0.5 : 1,
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% - 2px)', left: 12, right: 12,
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 50, maxHeight: 320, overflowY: 'auto',
        }}>
          {results.map(r => (
            <Link
              key={r.id}
              href={r.href}
              onClick={() => { setOpen(false); setQuery('') }}
              style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{r.section}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
