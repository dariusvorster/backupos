import { EmptyState } from '@/components/ui/empty-state'

export default function ActivityPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Activity</h1>
      <EmptyState
        type="page"
        headline="No activity in the last 30 days"
        description="Events from backup jobs, agent enrolments, and repository checks will appear here."
      />
    </div>
  )
}
