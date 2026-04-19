'use client'

import { useEffect, useRef } from 'react'
import { getSystemStatus }   from '@/app/actions/system-status'

const FAVICONS = {
  idle:    '/favicon.svg',
  running: '/favicon-running.svg',
  alert:   '/favicon-alert.svg',
} as const

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href
}

function setTitle(activeRuns: number, alerts: number) {
  const base = 'BackupOS'
  if (alerts > 0) {
    document.title = `(${alerts}) ${base}`
  } else if (activeRuns > 0) {
    document.title = `● ${base}`
  } else {
    document.title = base
  }
}

export function FaviconManager() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function poll() {
    try {
      const { activeRunCount, alertCount } = await getSystemStatus()
      if (alertCount > 0) {
        setFavicon(FAVICONS.alert)
      } else if (activeRunCount > 0) {
        setFavicon(FAVICONS.running)
      } else {
        setFavicon(FAVICONS.idle)
      }
      setTitle(activeRunCount, alertCount)
    } catch {
      // silently ignore — favicon state is non-critical
    }
  }

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return null
}
