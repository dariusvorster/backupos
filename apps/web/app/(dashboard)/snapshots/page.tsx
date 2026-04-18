import { EmptyState } from '@/components/ui/empty-state'

export default function SnapshotsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Snapshots</h1>
      <EmptyState
        type="inline"
        headline="Select a repository to browse snapshots."
        primaryAction={{ label: 'View repositories', href: '/repositories' }}
      />
    </div>
  )
}
