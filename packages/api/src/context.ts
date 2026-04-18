import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export interface AuthUser {
  id:    string
  email: string
  name?: string
}

export interface Context {
  db:       BetterSQLite3Database<Record<string, unknown>>
  user:     AuthUser | null
  dispatch: (agentId: string, msg: object) => boolean
}
