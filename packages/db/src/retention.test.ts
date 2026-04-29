import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'
import type { Db } from './index'
import { parseRetention, pruneRetainedLogs } from '../../../apps/web/lib/retention'

const { alerts, auditLog, operationalLogs, loggingConfig } = schema

function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  const migrationsDir = join(__dirname, '..', 'migrations')
  const journal = JSON.parse(
    readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> }
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(migrationsDir, `${tag}.sql`), 'utf-8')
    const stmts = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of stmts) {
      try {
        sqlite.prepare(stmt).run()
      } catch {
        // ignore already-applied statements
      }
    }
  }
  return drizzle(sqlite, { schema }) as Db
}

// ── parseRetention unit tests ────────────────────────────────────────────────

describe('parseRetention', () => {
  it("'90d' → 7_776_000_000", () => {
    expect(parseRetention('90d')).toBe(7_776_000_000)
  })

  it("'365d' → 31_536_000_000", () => {
    expect(parseRetention('365d')).toBe(31_536_000_000)
  })

  it("'3y' → 94_608_000_000", () => {
    expect(parseRetention('3y')).toBe(94_608_000_000)
  })

  it("'7y' → 220_752_000_000", () => {
    expect(parseRetention('7y')).toBe(220_752_000_000)
  })

  it("'forever' → null", () => {
    expect(parseRetention('forever')).toBeNull()
  })

  it.each(['', '90', '90x', 'abc', '-1d', '90 d'])("'%s' throws", (s) => {
    expect(() => parseRetention(s)).toThrow()
  })
})

// ── pruneRetainedLogs integration tests ─────────────────────────────────────

describe('pruneRetainedLogs', () => {
  let db: Db

  beforeEach(() => {
    db = createTestDb()
  })

  it('deletes alerts older than activityRetention, keeps newer ones', async () => {
    const oldDate = new Date(Date.now() - 91 * 86_400_000)
    const newDate = new Date(Date.now() - 1 * 86_400_000)

    db.insert(alerts).values([
      ...Array.from({ length: 50 }, (_, i) => ({
        id: `old-${i}`, type: 'test', message: 'old', status: 'open' as const, firedAt: oldDate,
      })),
      ...Array.from({ length: 50 }, (_, i) => ({
        id: `new-${i}`, type: 'test', message: 'new', status: 'open' as const, firedAt: newDate,
      })),
    ]).run()
    db.insert(loggingConfig).values({ id: 'singleton', activityRetention: '90d', auditRetention: 'forever', opsRetention: 'forever' }).run()

    const result = await pruneRetainedLogs(db)

    expect(result.alerts).toBe(50)
    expect(result.audit).toBe(0)
    expect(result.ops).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(db.select().from(alerts).all()).toHaveLength(50)
  })

  it('skips pruning when auditRetention is forever', async () => {
    const oldDate = new Date(Date.now() - 400 * 86_400_000)
    db.insert(auditLog).values([
      { id: 'a1', action: 'test', resourceType: 'system', createdAt: oldDate },
      { id: 'a2', action: 'test', resourceType: 'system', createdAt: oldDate },
    ]).run()
    db.insert(loggingConfig).values({ id: 'singleton', activityRetention: 'forever', auditRetention: 'forever', opsRetention: 'forever' }).run()

    const result = await pruneRetainedLogs(db)

    expect(result.audit).toBe(0)
    expect(db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.action, 'test')).all()).toHaveLength(2)
  })

  it('deletes 25,000 old alerts without crashing (batched)', async () => {
    const oldDate = new Date(Date.now() - 100 * 86_400_000)
    for (let i = 0; i < 50; i++) {
      db.insert(alerts).values(
        Array.from({ length: 500 }, (_, j) => ({
          id: `bulk-${i}-${j}`,
          type: 'test',
          message: 'bulk',
          status: 'open' as const,
          firedAt: oldDate,
        })),
      ).run()
    }
    db.insert(loggingConfig).values({ id: 'singleton', activityRetention: '90d', auditRetention: 'forever', opsRetention: 'forever' }).run()

    const result = await pruneRetainedLogs(db)

    expect(result.alerts).toBe(25_000)
    expect(result.errors).toHaveLength(0)
    expect(db.select().from(alerts).all()).toHaveLength(0)
  }, 30_000)

  it('skips one table on malformed retention, prunes others, writes audit entry with error summary', async () => {
    const oldDate = new Date(Date.now() - 400 * 86_400_000)
    db.insert(auditLog).values([{ id: 'a1', action: 'test', resourceType: 'system', createdAt: oldDate }]).run()
    db.insert(operationalLogs).values([{ id: 'o1', level: 'info', component: 'test', message: 'test', createdAt: oldDate }]).run()
    db.insert(loggingConfig).values({
      id: 'singleton',
      activityRetention: 'garbage',
      auditRetention: '365d',
      opsRetention: '90d',
    }).run()

    const result = await pruneRetainedLogs(db)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].table).toBe('alerts')
    expect(result.audit).toBe(1)
    expect(result.ops).toBe(1)

    const sweepEntries = db.select().from(auditLog).where(eq(auditLog.action, 'retention_sweep')).all()
    expect(sweepEntries).toHaveLength(1)
    expect(sweepEntries[0].detail).toContain('Errors:')
  })

  it('updates lastSweepAt and per-table deleted counts after sweep', async () => {
    const oldDate = new Date(Date.now() - 100 * 86_400_000)
    db.insert(alerts).values([
      { id: 'a1', type: 'test', message: 'm', status: 'open' as const, firedAt: oldDate },
      { id: 'a2', type: 'test', message: 'm', status: 'open' as const, firedAt: oldDate },
    ]).run()
    db.insert(loggingConfig).values({ id: 'singleton', activityRetention: '90d', auditRetention: 'forever', opsRetention: 'forever' }).run()

    const before = Date.now()
    const result = await pruneRetainedLogs(db)
    const after = Date.now()

    expect(result.alerts).toBe(2)
    const row = db.select().from(loggingConfig).get()!
    expect(row.lastSweepAt).not.toBeNull()
    expect(row.lastSweepAt!.getTime()).toBeGreaterThanOrEqual(before)
    expect(row.lastSweepAt!.getTime()).toBeLessThanOrEqual(after)
    expect(row.lastSweepDeletedAlerts).toBe(2)
    expect(row.lastSweepDeletedAudit).toBe(0)
    expect(row.lastSweepDeletedOps).toBe(0)
  })

  it('no-ops without crashing when logging_config row is missing', async () => {
    db.insert(alerts).values([
      { id: 'a1', type: 'test', message: 'm', status: 'open' as const, firedAt: new Date(Date.now() - 200 * 86_400_000) },
    ]).run()

    const result = await pruneRetainedLogs(db)

    expect(result.alerts).toBe(0)
    expect(result.audit).toBe(0)
    expect(result.ops).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(db.select().from(alerts).all()).toHaveLength(1)
  })
})
