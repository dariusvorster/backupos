# BackupOS Marketing Site — /cloud and /pricing Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/cloud/` and `/pricing/` pages to the `apps/web-site/` static-export marketing site, sharing the existing Nav and Footer.

**Architecture:** Two new Next.js App Router page files, each importing Nav + Footer from existing components plus new page-specific section components. No state or client components except the pricing toggle if added — keeping everything server-renderable for static export.

**Tech Stack:** Next.js 15 static export, TypeScript, CSS custom properties (same design system as v2-25 landing page — amber #F5A623, dark surfaces, Inter + IBM Plex Mono via @fontsource).

---

## File Map

| File | Responsibility |
|------|----------------|
| `apps/web-site/app/cloud/page.tsx` | `/cloud/` page — wires Nav, CloudHero, CloudFeatures, Footer |
| `apps/web-site/app/components/cloud-hero.tsx` | Hero + value prop strip for cloud page |
| `apps/web-site/app/components/cloud-features.tsx` | 6-card managed-service features grid |
| `apps/web-site/app/pricing/page.tsx` | `/pricing/` page — wires Nav, PricingCards, PricingFaq, Footer |
| `apps/web-site/app/components/pricing-cards.tsx` | 4 pricing tier cards (Self-hosted free + 3 cloud tiers) |
| `apps/web-site/app/components/pricing-faq.tsx` | Static FAQ list |

---

### Task 1: Cloud page hero + features

**Files:**
- Create: `apps/web-site/app/components/cloud-hero.tsx`
- Create: `apps/web-site/app/components/cloud-features.tsx`
- Create: `apps/web-site/app/cloud/page.tsx`

- [ ] **Step 1: Create cloud-hero.tsx**

```typescript
export function CloudHero() {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 80, textAlign: 'center' }}>
      <div className="container">
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)',
          fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 24,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          BackupOS Cloud · Managed hosting
        </div>

        <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 62px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Backup management<br />
          <span style={{ color: 'var(--accent)' }}>without the server</span>
        </h1>

        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--fg-dim)', maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.65 }}>
          All of BackupOS — no VPS required. We run the agents and keep the lights on. You just add repositories and set a schedule.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 60 }}>
          <a href="mailto:cloud@backupos.dev?subject=Cloud waitlist" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 600,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#000',
          }}>
            Join the waitlist
          </a>
          <a href="/pricing/" style={{
            padding: '11px 28px', fontSize: 15, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--fg)',
          }}>
            See pricing
          </a>
        </div>

        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { stat: '99.9%', label: 'uptime SLA' },
            { stat: 'EU & US', label: 'regions' },
            { stat: 'SOC 2', label: 'in progress' },
            { stat: '< 60 s', label: 'agent connect' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>{s.stat}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create cloud-features.tsx**

```typescript
const features = [
  {
    icon: '🤖',
    title: 'Managed agents',
    body: 'We deploy and maintain Restic agents for you. No SSH keys, no cron tabs, no server provisioning.',
  },
  {
    icon: '💾',
    title: 'Storage included',
    body: 'S3-compatible object storage bundled with every plan. Bring your own bucket or use ours.',
  },
  {
    icon: '🔄',
    title: 'Automatic updates',
    body: 'BackupOS and Restic are kept up-to-date automatically — zero-downtime rolling upgrades.',
  },
  {
    icon: '🌍',
    title: 'Multi-region',
    body: 'Choose EU (Frankfurt) or US (Virginia) for your control plane and storage. GDPR-ready.',
  },
  {
    icon: '🛡',
    title: 'End-to-end encryption',
    body: 'All repository passwords are encrypted client-side. We never see your data keys.',
  },
  {
    icon: '👥',
    title: 'Team access',
    body: 'Invite team members, assign repository permissions, and share runbooks across your org.',
  },
]

export function CloudFeatures() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Everything managed for you
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Focus on your applications. We keep your backups running.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '24px 24px 20px',
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create cloud/page.tsx**

```typescript
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
```

- [ ] **Step 4: Verify files written**

```bash
ls /Users/dariusvorster/Projects/backupos/apps/web-site/app/cloud/page.tsx \
   /Users/dariusvorster/Projects/backupos/apps/web-site/app/components/cloud-hero.tsx \
   /Users/dariusvorster/Projects/backupos/apps/web-site/app/components/cloud-features.tsx
```
Expected: all 3 paths printed without error.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/cloud/page.tsx \
        apps/web-site/app/components/cloud-hero.tsx \
        apps/web-site/app/components/cloud-features.tsx
git commit -m "feat(web-site): /cloud page — hero, stats strip, managed-service features"
```

---

### Task 2: Pricing cards + FAQ components

**Files:**
- Create: `apps/web-site/app/components/pricing-cards.tsx`
- Create: `apps/web-site/app/components/pricing-faq.tsx`

- [ ] **Step 1: Create pricing-cards.tsx**

```typescript
import type { CSSProperties } from 'react'

interface Tier {
  name: string
  price: string
  period: string
  badge?: string
  description: string
  cta: string
  ctaHref: string
  highlighted: boolean
  features: string[]
}

const tiers: Tier[] = [
  {
    name: 'Self-hosted',
    price: 'Free',
    period: 'forever',
    description: 'Run BackupOS on your own server. Full features, no limits, MIT licensed.',
    cta: 'Get started',
    ctaHref: '/#install',
    highlighted: false,
    features: [
      'Unlimited repositories',
      'Unlimited users',
      'All backup features',
      'Email alerts (your SMTP)',
      'Community support',
    ],
  },
  {
    name: 'Cloud Solo',
    price: '$9',
    period: '/ month',
    description: 'BackupOS Cloud for solo developers and hobbyists.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Solo waitlist',
    highlighted: false,
    features: [
      '1 user',
      '5 repositories',
      '100 GB bundled storage',
      'Email alerts included',
      'Managed agents',
      'Email support',
    ],
  },
  {
    name: 'Cloud Team',
    price: '$29',
    period: '/ month',
    badge: 'Most popular',
    description: 'For small teams and startups who need reliable, hassle-free backups.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Team waitlist',
    highlighted: true,
    features: [
      '5 users',
      '25 repositories',
      '500 GB bundled storage',
      'Email + webhook alerts',
      'Managed agents',
      'Priority email support',
      'Audit log export',
    ],
  },
  {
    name: 'Cloud Business',
    price: '$79',
    period: '/ month',
    description: 'Unlimited scale for teams that run critical infrastructure.',
    cta: 'Join waitlist',
    ctaHref: 'mailto:cloud@backupos.dev?subject=Cloud Business waitlist',
    highlighted: false,
    features: [
      'Unlimited users',
      'Unlimited repositories',
      '2 TB bundled storage',
      'All alert channels',
      'Managed agents + DR runbooks',
      'Slack / Teams support',
      'SSO (SAML)',
      'Custom retention policies',
    ],
  },
]

const check = '✓'

export function PricingCards() {
  const cardBase: CSSProperties = {
    background: 'var(--surf)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '28px 28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  }

  return (
    <section style={{ padding: '80px 0' }}>
      <div className="container">
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          Simple, transparent pricing
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 52 }}>
          Self-host for free forever, or let us run it for you.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'start' }}>
          {tiers.map(t => (
            <div key={t.name} style={{
              ...cardBase,
              border: t.highlighted ? '2px solid var(--accent)' : '1px solid var(--border)',
              position: 'relative',
            }}>
              {t.badge && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap',
                }}>
                  {t.badge}
                </div>
              )}

              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 700 }}>{t.price}</span>
                <span style={{ fontSize: 13, color: 'var(--fg-dim)', marginLeft: 4 }}>{t.period}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6, marginBottom: 20 }}>{t.description}</p>

              <a href={t.ctaHref} style={{
                display: 'block', textAlign: 'center',
                padding: '9px 16px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-sm)',
                background: t.highlighted ? 'var(--accent)' : 'var(--surf2)',
                border: t.highlighted ? 'none' : '1px solid var(--border)',
                color: t.highlighted ? '#000' : 'var(--fg)',
                marginBottom: 24,
                textDecoration: 'none',
              }}>
                {t.cta}
              </a>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--fg-dim)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--ok)', flexShrink: 0 }}>{check}</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create pricing-faq.tsx**

```typescript
const faqs = [
  {
    q: 'Can I migrate from self-hosted to cloud?',
    a: 'Yes. BackupOS Cloud uses the same Restic repository format. Export your repos, point them at your cloud workspace, and your snapshot history is intact.',
  },
  {
    q: 'What counts as "bundled storage"?',
    a: 'Bundled storage is the compressed, deduplicated data stored in your BackupOS-managed object bucket. You can also bring your own S3-compatible bucket at no extra cost.',
  },
  {
    q: 'Is the self-hosted version truly unlimited?',
    a: 'Yes — MIT license, no call-home, no feature flags. Repositories, users, and retention policies are all uncapped.',
  },
  {
    q: 'Can I cancel my cloud plan anytime?',
    a: 'Yes. Cancel with one click and export all your data within 30 days. No lock-in.',
  },
  {
    q: 'Do cloud plans include the DR restore wizards?',
    a: 'Yes. File, database, and full-host restore wizards are available on all cloud tiers.',
  },
  {
    q: 'How is repository password security handled on cloud?',
    a: 'Repository passwords are encrypted client-side with AES-256-GCM before being stored. BackupOS Cloud never sees your plaintext keys.',
  },
]

export function PricingFaq() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--surf)' }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 700, textAlign: 'center', marginBottom: 48 }}>
          Frequently asked questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {faqs.map((faq, i) => (
            <div key={faq.q} style={{
              padding: '24px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{faq.q}</div>
              <div style={{ fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.7 }}>{faq.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify files written**

```bash
ls /Users/dariusvorster/Projects/backupos/apps/web-site/app/components/pricing-cards.tsx \
   /Users/dariusvorster/Projects/backupos/apps/web-site/app/components/pricing-faq.tsx
```
Expected: both paths printed without error.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/components/pricing-cards.tsx \
        apps/web-site/app/components/pricing-faq.tsx
git commit -m "feat(web-site): pricing-cards + pricing-faq components"
```

---

### Task 3: /pricing page + typecheck + build

**Files:**
- Create: `apps/web-site/app/pricing/page.tsx`

- [ ] **Step 1: Create pricing/page.tsx**

```typescript
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
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm typecheck
```
Expected: exits 0 with no errors. If there are errors, fix them before proceeding.

- [ ] **Step 3: Run build**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web-site && pnpm build
```
Expected output includes:
```
○ /
○ /cloud
○ /pricing
○ /_not-found
```
And `✓ Exporting` completes successfully.

- [ ] **Step 4: Verify output files**

```bash
ls /Users/dariusvorster/Projects/backupos/apps/web-site/out/cloud/index.html \
   /Users/dariusvorster/Projects/backupos/apps/web-site/out/pricing/index.html
```
Expected: both files exist.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web-site/app/pricing/page.tsx
git commit -m "feat(web-site): /pricing page — tiers, FAQ, typecheck + build pass"
```

---

## Self-Review

**Spec coverage:**
- [x] `/cloud/` page with hero, stats, managed-service features — Tasks 1
- [x] `/pricing/` page with 4 tiers (self-hosted free + 3 cloud) — Task 2–3
- [x] FAQ section — Task 2
- [x] Shared Nav + Footer on both pages — Tasks 1 & 3
- [x] Static export verified (`out/cloud/index.html`, `out/pricing/index.html`) — Task 3
- [x] Metadata per page — Tasks 1 & 3

**Placeholder scan:** No TBD, no TODO, all code complete. Waitlist CTA uses `mailto:` which is a real working link for a pre-launch product.

**Type consistency:**
- `Tier` interface defined and used only in `pricing-cards.tsx`
- `CSSProperties` imported from `react` in `pricing-cards.tsx`
- All component exports (`CloudHero`, `CloudFeatures`, `PricingCards`, `PricingFaq`) match imports in page files exactly
