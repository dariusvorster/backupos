import { getDb, backupMonitors } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import { EditMonitorForm } from './edit-form'

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, id)).limit(1)
  if (!monitor) notFound()

  const config = JSON.parse(monitor.config) as { url?: string; apiKey?: string }

  return (
    <EditMonitorForm
      id={id}
      name={monitor.name}
      url={config.url ?? ''}
      group={monitor.group ?? ''}
    />
  )
}
