import { Sidebar } from '@/components/sidebar'
import { Topbar }  from '@/components/topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
      <Sidebar />
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
  )
}
