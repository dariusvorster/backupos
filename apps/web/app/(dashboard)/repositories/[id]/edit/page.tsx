import { getDb, repositories } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound, redirect } from 'next/navigation'
import { EditRepositoryForm } from './edit-form'
import { decryptField } from '@/lib/repo-crypto'
import { getCurrentUser, isAdmin } from '@/lib/user'

export default async function EditRepositoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!isAdmin(currentUser)) redirect(`/repositories/${id}`)
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  const config     = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const mountConfig = config['mountConfig'] ? (JSON.parse(config['mountConfig']) as Record<string, string>) : null

  return (
    <EditRepositoryForm
      id={id}
      name={repo.name}
      backend={repo.backend}
      group={repo.group ?? ''}
      config={config}
      mountConfig={mountConfig}
    />
  )
}
