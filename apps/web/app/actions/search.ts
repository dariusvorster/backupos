'use server'

import { searchAll } from '@/lib/search'
import type { SearchResult } from '@/lib/search'
import { requireUserAction } from '@/lib/user'

export async function search(query: string): Promise<SearchResult[]> {
  await requireUserAction()
  if (typeof query !== 'string') return []
  return searchAll(query.slice(0, 128))
}
