import { getDb, instanceSettings } from '@backupos/db'

export async function getInstanceSettings() {
  const db = getDb()
  const [row] = await db.select().from(instanceSettings).limit(1).all()
  return row ?? null
}
