import { Nav }          from './components/nav'
import { Hero }         from './components/hero'
import { Problem }      from './components/problem'
import { VsPbs }        from './components/vs-pbs'
import { FeaturesGrid } from './components/features-grid'
import { Backends }     from './components/backends'
import { Install }      from './components/install'
import { OsFamily }     from './components/os-family'
import { Footer }       from './components/footer'

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <VsPbs />
        <FeaturesGrid />
        <Backends />
        <Install />
        <OsFamily />
      </main>
      <Footer />
    </>
  )
}
