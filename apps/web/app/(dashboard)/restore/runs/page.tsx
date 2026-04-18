import { EmptyState } from '@/components/ui/empty-state'

export default function RestoreRunsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Restore runs</h1>
      <EmptyState
        type="inline"
        headline="No restore runs yet. Runs appear here when you execute a restore spec."
        primaryAction={{ label: 'View specs', href: '/restore' }}
      />
    </div>
  )
}
