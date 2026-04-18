'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

interface DrModeContextValue {
  active: boolean
  toggle: () => void
  hasFailed24h: boolean
}

const DrModeContext = createContext<DrModeContextValue>({
  active: false,
  toggle: () => {},
  hasFailed24h: false,
})

export function useDrMode(): DrModeContextValue {
  return useContext(DrModeContext)
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
