import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDb, verificationTests, eq } from '@backupos/db'
import { EditVerificationForm } from './EditVerificationForm'

export const dynamic = 'force-dynamic'

interface SshConfig {
  host:          string
  port:          number
  user:          string
  remoteDir:     string
  cleanupRemote: boolean
}

export default async function EditVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const [test] = await db.select().from(verificationTests).where(eq(verificationTests.id, id)).limit(1)
  if (!test) notFound()

  let sshConfig: SshConfig | null = null
  if (test.targetType === 'ssh_target' && test.targetConfig) {
    try {
      const cfg = JSON.parse(test.targetConfig) as Record<string, string | number | boolean>
      sshConfig = {
        host:          (cfg['host'] as string) ?? '',
        port:          (cfg['port'] as number) ?? 22,
        user:          (cfg['user'] as string) ?? '',
        remoteDir:     (cfg['remoteDir'] as string) ?? '',
        cleanupRemote: (cfg['cleanupRemote'] as boolean) ?? true,
      }
    } catch { /* leave null */ }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/verification/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {test.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Edit verification test</h1>
      </div>
      <EditVerificationForm
        id={id}
        targetType={test.targetType}
        initialName={test.name}
        initialSchedule={test.schedule ?? ''}
        initialValidationHook={test.validationHook ?? ''}
        initialSsh={sshConfig}
      />
    </div>
  )
}
