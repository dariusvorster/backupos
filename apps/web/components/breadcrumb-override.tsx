'use client'

import { useEffect } from 'react'
import { useBreadcrumb } from './breadcrumb-provider'

interface Props {
  segment: string
  label:   string
}

export function BreadcrumbOverride({ segment, label }: Props) {
  const { setOverride } = useBreadcrumb()
  useEffect(() => {
    if (!segment || !label) return
    setOverride(segment, label)
  }, [segment, label, setOverride])
  return null
}
