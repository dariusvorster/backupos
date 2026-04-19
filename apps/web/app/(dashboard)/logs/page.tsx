import { getLogsPage } from '@/app/actions/logs'
import { LogsClient }  from './client'

export default async function LogsPage() {
  const initialLogs = await getLogsPage({}, 200)
  return <LogsClient initialLogs={initialLogs} />
}
