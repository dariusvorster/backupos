import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { createHash } from 'crypto'
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzleSqlite<typeof schema>>

let _sqlite: Database.Database | undefined
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
  _sqlite = new Database(filePath)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')

  _db = drizzleSqlite(_sqlite, { schema })
  return _db
}

export function runMigrations(): void {
  getDb() // ensure _sqlite is initialized
  const sqlite = _sqlite!

  // Use better-sqlite3's exec() which supports multi-statement SQL, unlike prepare()
  sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    created_at INTEGER
  )`)

  const migrationsFolder = join(__dirname, '..', 'migrations')
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> }

  const appliedHashes = new Set(
    (sqlite.prepare('SELECT hash FROM "__drizzle_migrations"').all() as Array<{ hash: string }>)
      .map(r => r.hash),
  )

  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(migrationsFolder, `${tag}.sql`), 'utf-8')
    // drizzle-orm computes sha256 of the raw SQL file as the migration hash
    const hash = createHash('sha256').update(sql).digest('hex')
    if (appliedHashes.has(hash)) continue
    // drizzle-kit separates statements with --> statement-breakpoint in multi-op files
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    // Run each statement individually so a partially-applied migration (where
    // some statements already ran but others didn't) still applies the missing ones.
    for (const stmt of statements) {
      try {
        sqlite.exec(stmt)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        const isIdempotent = msg.includes('already exists') || msg.includes('duplicate column name')
        if (!isIdempotent) throw e
        console.warn(`[db] ${tag}: skipping already-applied statement (${msg})`)
      }
    }
    sqlite.prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)').run(hash, Date.now())
  }
}

export * from './schema'

// Re-export common drizzle operators so consumers use a single drizzle-orm instance
export { eq, ne, gt, gte, lt, lte, and, or, not, desc, asc, sql, count, isNull, isNotNull, inArray, like } from 'drizzle-orm'
