import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzleSqlite<typeof schema>>

let _db: Db | undefined

export function getDb(): Db {
  if (_db) return _db

  const url = process.env['DATABASE_URL'] ?? 'file:./data/backupos.db'

  if (!url.startsWith('file:')) {
    throw new Error(
      'PostgreSQL support is available in BackupOS Cloud. ' +
      'For self-hosted, set DATABASE_URL=file:./data/backupos.db',
    )
  }

  const filePath = url.slice('file:'.length)
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  _db = drizzleSqlite(sqlite, { schema })
  return _db
}

export * from './schema'

// Re-export common drizzle operators so consumers use a single drizzle-orm instance
export { eq, ne, gt, gte, lt, lte, and, or, not, desc, asc, sql, count, isNull, isNotNull, inArray, like } from 'drizzle-orm'
