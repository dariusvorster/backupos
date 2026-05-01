import { redirect }           from 'next/navigation'
import { getCurrentUser }     from '@/lib/user'
import { CreateDatastoreForm } from './client'

export default async function NewDatastorePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  return (
    <div style={{ maxWidth: 520, padding: '32px 0' }}>
      <a href="/pbs" style={{ display: 'inline-block', fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Back to datastores</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>New PBS datastore</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 28 }}>
        Creates a directory under{' '}
        <code style={{ fontSize: 12 }}>/var/lib/backupos/pbs/&lt;name&gt;/</code> and pre-allocates the
        chunk-store layout (65,536 shard directories). This may take a few seconds on the first run.
      </p>
      <CreateDatastoreForm />
    </div>
  )
}
