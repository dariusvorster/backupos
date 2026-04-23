// apps/web/app/(dashboard)/layout.tsx
export const dynamic = 'force-dynamic'

import { redirect }               from 'next/navigation'
import { Sidebar }                from '@/components/sidebar'
import { getCurrentUser }         from '@/lib/user'
import { Topbar }                 from '@/components/topbar'
import { DrModeProvider }         from '@/components/dr-mode-provider'
import { DrModeOverlay }          from '@/components/dr-mode-overlay'
import { CommandPaletteProvider } from '@/components/command-palette-provider'
import { CommandPalette }         from '@/components/command-palette'
import { FaviconManager }         from '@/components/favicon-manager'
import {
  getDb, backupJobs, backupRuns,
  eq, and, gte,
} from '@backupos/db'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const db       = getDb()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [failedRuns, jobs] = await Promise.all([
    db.select({ id: backupRuns.id })
      .from(backupRuns)
      .where(and(eq(backupRuns.status, 'failed'), gte(backupRuns.startedAt, since24h)))
      .limit(1)
      .all(),
    db.select({ id: backupJobs.id, name: backupJobs.name })
      .from(backupJobs)
      .where(eq(backupJobs.enabled, true))
      .all(),
  ])

  const hasFailed24h = failedRuns.length > 0

  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const sidebarUser = {
    name:  currentUser.name,
    email: currentUser.email,
    image: currentUser.image ?? null,
  }

  return (
    <CommandPaletteProvider>
      <FaviconManager />
      <DrModeProvider hasFailed24h={hasFailed24h}>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
          <Sidebar user={sidebarUser} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <Topbar />
            <main style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24,
              backgroundColor: 'var(--bg)',
            }}>
              {children}
            </main>
          </div>
        </div>
        <DrModeOverlay jobs={jobs} />
        <CommandPalette />
      </DrModeProvider>
    </CommandPaletteProvider>
  )
}
