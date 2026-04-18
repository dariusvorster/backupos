'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

interface DrModeContextValue {
  active: boolean
  toggle: () => void
  hasFailed24h: boolean
}

const DrModeContext = createContext<DrModeContextValue | null>(null)

export function useDrMode(): DrModeContextValue {
  const ctx = useContext(DrModeContext)
  if (!ctx) throw new Error('useDrMode must be used within DrModeProvider')
  return ctx
}

interface DrModeProviderProps {
  children: React.ReactNode
  hasFailed24h: boolean
}

export function DrModeProvider({ children, hasFailed24h }: DrModeProviderProps) {
  const [active, setActive] = useState(false)
  const toggle = useCallback(() => setActive(v => !v), [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggle])

  return (
    <DrModeContext.Provider value={{ active, toggle, hasFailed24h }}>
      {children}
    </DrModeContext.Provider>
  )
}
