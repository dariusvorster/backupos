import { redirect }                   from 'next/navigation'
import { getDb, pbsTokens, pbsDatastores, desc } from '@backupos/db'
import { getCurrentUser }              from '@/lib/user'
import { getPbsServerInfo }            from '@/lib/pbs-server'
import { ConnectClient }               from './client'

export const dynamic = 'force-dynamic'

export default async function PbsConnectPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const db = getDb()
  const [tokens, datastores] = await Promise.all([
    db.select().from(pbsTokens).orderBy(desc(pbsTokens.createdAt)),
    db.select().from(pbsDatastores).orderBy(desc(pbsDatastores.createdAt)),
  ])

  let server: Awaited<ReturnType<typeof getPbsServerInfo>> | null = null
  let serverError: string | null = null
  try {
    server = await getPbsServerInfo()
  } catch (e) {
    serverError = (e as Error).message
  }

  const tokenOptions = tokens.map(t => ({
    id:          t.id,
    authId:      `${t.user}@${t.realm}!${t.tokenName}`,
    permissions: t.permissions,
  }))
  const datastoreOptions = datastores.map(d => ({ id: d.id, name: d.name }))

  return (
    <ConnectClient
      tokens={tokenOptions}
      datastores={datastoreOptions}
      server={server}
      serverError={serverError}
    />
  )
}
