'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { getRunDetail } from '@/app/actions/runs'
import type { RunDetail } from '@/app/actions/runs'

interface LogViewerProps {
  initialRun:     RunDetail
  onPhaseUpdate?: (run: RunDetail) => void
}

function parseLines(log: string | null): string[] {
  if (!log) return []
  return log.split('\n').filter(l => l.trim().length > 0)
}

function findFirstError(lines: string[]): number {
  return lines.findIndex(l => /\[error\]|\berror\b/i.test(l))
}

export function LogViewer({ initialRun, onPhaseUpdate }: LogViewerProps) {
  const [run,          setRun]          = useState<RunDetail>(initialRun)
  const [isPending,    startTransition] = useTransition()
  const scrollRef                       = useRef<HTMLDivElement>(null)
  const userScrolled                    = useRef(false)
  const intervalRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  const lines    = parseLines(run.log)
  const errorIdx = findFirstError(lines)
  const isLive   = run.status === 'running'

  // Auto-scroll to bottom for live runs (unless user scrolled up)
  useEffect(() => {
    if (!isLive || userScrolled.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, isLive])

  // Detect user scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const el = scrollRef.current
      if (!el) return
      userScrolled.current = el.scrollHeight - el.scrollTop - el.clientHeight >= 40
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Poll every 3s for live runs
  useEffect(() => {
    if (!isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      startTransition(async () => {
        const updated = await getRunDetail(initialRun.id)
        if (updated) { setRun(updated); onPhaseUpdate?.(updated) }
      })
    }, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isLive, initialRun.id, onPhaseUpdate])

  const jumpToError = useCallback(() => {
    if (errorIdx < 0 || !scrollRef.current) return
    const lineEls = scrollRef.current.querySelectorAll<HTMLElement>('[data-line]')
    lineEls[errorIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    userScrolled.current = true
  }, [errorIdx])

  const pct        = run.progressPct ?? null
  const bytesDone  = run.bytesDone  ?? null
  const bytesTotal = run.bytesTotal ?? null
  const filesDone  = run.filesDone  ?? null
  const filesTotal = run.filesTotal ?? null

  function fmtB(b: number): string {
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
    return `${(b / 1024 ** 3).toFixed(2)} GB`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Progress bar — only during running */}
      {isLive && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surf2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {bytesDone == null ? (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'inline-block', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
                  Starting backup…
                </>
              ) : (
                <>
                  {pct != null && bytesTotal != null && bytesTotal > 0
                    ? `${(pct * 100).toFixed(1)}%`
                    : filesDone != null ? `${filesDone.toLocaleString()} files` : ''}
                  {filesDone != null && filesTotal != null && filesTotal > 0
                    ? ` · ${filesDone.toLocaleString()} / ${filesTotal.toLocaleString()} files`
                    : filesDone != null ? ` files backed up` : ''}
                </>
              )}
            </span>
            <span>
              {bytesDone != null
                ? bytesTotal != null && bytesTotal > 0
                  ? `${fmtB(bytesDone)} / ${fmtB(bytesTotal)}`
                  : `${fmtB(bytesDone)} transferred`
                : ''}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--border)', overflow: 'hidden' }}>
            {pct != null && bytesTotal != null && bytesTotal > 0 ? (
              <div style={{
                height: '100%', borderRadius: 3, backgroundColor: 'var(--accent)',
                width: `${Math.min(pct * 100, 100)}%`, transition: 'width 0.4s ease',
              }} />
            ) : bytesDone != null ? (
              // Indeterminate pulse when no total is known
              <div style={{
                height: '100%', borderRadius: 3, backgroundColor: 'var(--accent)',
                width: '30%', animation: 'progress-slide 1.8s ease-in-out infinite',
              }} />
            ) : null}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        backgroundColor: 'var(--surf2)',
        borderBottom: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: 'var(--fg-mute)', flex: 1 }}>
          {isLive ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                backgroundColor: 'var(--ok)',
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }} />
              Live · {lines.length} lines
            </span>
          ) : `${lines.length} lines`}
        </span>
        {errorIdx >= 0 && (
          <button
            onClick={jumpToError}
            style={{
              fontSize: 12, padding: '3px 10px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--err)',
              color: 'var(--err)', background: 'none',
            }}
          >
            ↓ Jump to error
          </button>
        )}
        {isLive && isPending && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Refreshing…</span>
        )}
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        style={{
          height: 360,
          overflowY: 'auto',
          backgroundColor: '#0d1117',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          padding: '12px 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6e7681', fontSize: 12 }}>
            {isLive ? 'Waiting for log output…' : 'No log data recorded for this run.'}
          </div>
        ) : lines.map((line, i) => {
          const isError = /\[error\]|\berror\b/i.test(line)
          const isWarn  = /\[warn\]|\bwarn\b/i.test(line)
          return (
            <div
              key={i}
              data-line={i}
              style={{
                display: 'flex', alignItems: 'flex-start',
                padding: '1px 16px',
                backgroundColor: isError ? 'rgba(248,81,73,0.08)' : 'transparent',
                borderLeft: isError ? '2px solid #f85149' : isWarn ? '2px solid #d29922' : '2px solid transparent',
              }}
            >
              <span style={{ color: '#6e7681', userSelect: 'none', minWidth: 32, marginRight: 8, fontSize: 11 }}>
                {String(i + 1).padStart(3, ' ')}
              </span>
              <span style={{ color: isError ? '#f85149' : isWarn ? '#d29922' : '#c9d1d9', wordBreak: 'break-all' }}>
                {line}
              </span>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes progress-slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(200%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}
