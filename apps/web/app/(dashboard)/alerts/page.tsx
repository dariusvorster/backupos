import { EmptyState } from '@/components/ui/empty-state'

export default function AlertsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Alerts</h1>
      <EmptyState
        type="page"
        headline="All quiet. No open alerts."
        description="Backup failures, missed schedules, and agent disconnections will appear here."
      />
    </div>
  )
}
