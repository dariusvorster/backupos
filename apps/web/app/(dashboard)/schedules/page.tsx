import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

export default function SchedulesPage() {
  return (
    <div>
      <PageHeader title="Schedules" />
      <EmptyState
        type="inline"
        headline="No active schedules. Jobs without schedules only run on demand."
        primaryAction={{ label: 'View jobs', href: '/jobs' }}
      />
    </div>
  )
}
