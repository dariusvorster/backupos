import { Nav }           from '../components/nav'
import { CloudHero }     from '../components/cloud-hero'
import { CloudFeatures } from '../components/cloud-features'
import { Footer }        from '../components/footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BackupOS Cloud — Managed Restic backup hosting',
  description: 'BackupOS as a service. No server required — we manage the agents, storage, and uptime.',
}

export default function CloudPage() {
  return (
    <>
      <Nav />
      <main>
        <CloudHero />
        <CloudFeatures />
      </main>
      <Footer />
    </>
  )
}
