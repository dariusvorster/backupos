import { EmptyState } from '@/components/ui/empty-state'

export default function SchedulesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Schedules</h1>
      <EmptyState
        type="inline"
        headline="No active schedules. Jobs without schedules only run on demand."
        primaryAction={{ label: 'View jobs', href: '/jobs' }}
      />
    </div>
  )
}
