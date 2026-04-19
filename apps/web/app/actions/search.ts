'use server'

import { searchAll } from '@/lib/search'
import type { SearchResult } from '@/lib/search'

export async function search(query: string): Promise<SearchResult[]> {
  return searchAll(query)
}
