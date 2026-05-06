import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { ConnectFormPage } from '../client'

export const dynamic = 'force-dynamic'

export default async function XcpConnectPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Connect XCP-ng Pool</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>
        Add an XCP-ng pool master. BackupOS will verify the connection before saving.
      </p>
      <ConnectFormPage />
    </div>
  )
}
