'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface BreadcrumbContextValue {
  overrides: Record<string, string>
  setOverride: (segment: string, label: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const setOverride = useCallback((segment: string, label: string) => {
    setOverrides(prev => {
      if (prev[segment] === label) return prev
      return { ...prev, [segment]: label }
    })
  }, [])

  return (
    <BreadcrumbContext.Provider value={{ overrides, setOverride }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) {
    return { overrides: {}, setOverride: () => {} }
  }
  return ctx
}
