import { EmptyState } from '@/components/ui/empty-state'

export default function AuditPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Audit log</h1>
      <EmptyState
        type="filtered"
        headline="No audit events match your filters."
      />
    </div>
  )
}
