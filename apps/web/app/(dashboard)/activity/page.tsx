import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

export default function ActivityPage() {
  return (
    <div>
      <PageHeader title="Activity" />
      <EmptyState
        type="page"
        headline="No activity in the last 30 days"
        description="Events from backup jobs, agent enrolments, and repository checks will appear here."
      />
    </div>
  )
}
