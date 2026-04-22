import { Nav }          from '../components/nav'
import { PricingCards } from '../components/pricing-cards'
import { PricingFaq }   from '../components/pricing-faq'
import { Footer }       from '../components/footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — BackupOS',
  description: 'BackupOS is free to self-host forever. Cloud plans start at $9/month.',
}

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: 60 }}>
        <PricingCards />
        <PricingFaq />
      </main>
      <Footer />
    </>
  )
}
