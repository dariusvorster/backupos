import { getAuditPage, checkAuditIntegrity } from '@/app/actions/audit'
import { AuditClient }                       from './client'

export default async function AuditPage() {
  const [entries, integrity] = await Promise.all([
    getAuditPage({}, 200),
    checkAuditIntegrity(),
  ])
  return <AuditClient initialEntries={entries} integrity={integrity} />
}
