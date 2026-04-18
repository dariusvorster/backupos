import type { Config } from 'drizzle-kit'

const url = process.env['DATABASE_URL'] ?? 'file:./data/backupos.db'

export default {
  schema: './src/schema.ts',
  out:    './migrations',
  dialect: 'sqlite',
  dbCredentials: { url },
} satisfies Config
