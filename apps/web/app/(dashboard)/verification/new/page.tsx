import { getDb, backupJobs } from '@backupos/db'
import { VerificationWizard } from '@/components/ui/verification-wizard'
import Link from 'next/link'

export default async function NewVerificationPage() {
  const db   = getDb()
  const jobs = await db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/verification" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← Verification
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>New verification test</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Define a scheduled restore test to prove your backups are actually usable.
        </p>
      </div>
      <VerificationWizard jobs={jobs} />
    </div>
  )
}
