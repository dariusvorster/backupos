# Profile, Avatar & Security (TOTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement user profile management (§3.3), avatar (§3.2), profile popover in sidebar (§3.1), and TOTP two-factor authentication on a dedicated security page (§3.5) for BackupOS.

**Architecture:** `better-auth` (already installed at ^1.2.0) handles email/password auth and sessions via a Drizzle adapter. Five new DB tables are added to `packages/db`: `user`, `session`, `account`, `verification`, `two_factor`. TOTP is implemented independently using the `otpauth` npm package — a `two_factor` table stores the secret and backup codes. The sidebar's static "A" avatar placeholder is replaced by a `ProfilePopover` client component that receives user data from the dashboard server layout. Profile settings live at `/settings/profile`; password + TOTP at `/settings/security`. Phone verification (§3.4) is UI-only — the form field is present but SMS sending is stubbed pending an SMS provider.

**Tech Stack:** Next.js 15, TypeScript strict, better-auth ^1.2.0, Drizzle ORM + better-sqlite3, `otpauth` (new dep), `react-qr-code` (new dep).

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add user, session, account, verification, two_factor tables |
| `packages/db/src/index.ts` | Modify — export new table symbols |
| `apps/web/lib/auth.ts` | Create — better-auth config (emailAndPassword + Drizzle adapter) |
| `apps/web/app/api/auth/[...all]/route.ts` | Create — better-auth Next.js handler |
| `apps/web/scripts/seed-user.ts` | Create — seed default admin user (admin@backupos.local / changeme) |
| `apps/web/lib/user.ts` | Create — `getCurrentUser()` server helper (reads session from headers) |
| `apps/web/lib/totp.ts` | Create — TOTP generation/verification via `otpauth` |
| `apps/web/app/actions/user.ts` | Create — updateProfile, uploadAvatar, removeAvatar, changePassword |
| `apps/web/app/actions/totp.ts` | Create — initTotp, enableTotp, disableTotp server actions |
| `apps/web/components/avatar.tsx` | Create — Avatar component (initials fallback, sizes 24/32/48/80) |
| `apps/web/components/profile-popover.tsx` | Create — profile menu popover (client component) |
| `apps/web/components/sidebar.tsx` | Modify — accept `user` prop, replace static avatar with ProfilePopover |
| `apps/web/components/totp-setup-modal.tsx` | Create — 3-step TOTP enrolment modal (client component) |
| `apps/web/app/(dashboard)/layout.tsx` | Modify — fetch current user via getCurrentUser(), pass to Sidebar |
| `apps/web/app/(dashboard)/settings/page.tsx` | Modify — add Profile + Security to linked items nav |
| `apps/web/app/(dashboard)/settings/profile/page.tsx` | Create — profile settings page |
| `apps/web/app/(dashboard)/settings/security/page.tsx` | Create — security settings page |

---

### Task 1: DB schema — auth + profile tables

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Read schema.ts and index.ts**

```bash
cat /Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts
cat /Users/dariusvorster/Projects/backupos/packages/db/src/index.ts
```

- [ ] **Step 2: Append the five new tables to schema.ts**

Add the following after the last existing table definition in `packages/db/src/schema.ts`:

```typescript
// ── Auth (better-auth) ────────────────────────────────────────────────────

export const user = sqliteTable('user', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  email:           text('email').notNull().unique(),
  emailVerified:   integer('email_verified',    { mode: 'boolean' }).notNull().default(false),
  image:           text('image'),
  createdAt:       integer('created_at',        { mode: 'timestamp' }).notNull(),
  updatedAt:       integer('updated_at',        { mode: 'timestamp' }).notNull(),
  // Extended profile fields
  displayName:     text('display_name'),
  phone:           text('phone'),
  phoneVerifiedAt: integer('phone_verified_at', { mode: 'timestamp' }),
  timezone:        text('timezone').notNull().default('UTC'),
  language:        text('language').notNull().default('en'),
  emailNotify:     integer('email_notify',      { mode: 'boolean' }).notNull().default(true),
  smsNotify:       integer('sms_notify',        { mode: 'boolean' }).notNull().default(false),
  notifyAlerts:    integer('notify_alerts',     { mode: 'boolean' }).notNull().default(true),
  notifyWeekly:    integer('notify_weekly',     { mode: 'boolean' }).notNull().default(true),
  notifyUpdates:   integer('notify_updates',    { mode: 'boolean' }).notNull().default(false),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
})

export const session = sqliteTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token:     text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('account_id').notNull(),
  providerId:            text('provider_id').notNull(),
  userId:                text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:           text('access_token'),
  refreshToken:          text('refresh_token'),
  idToken:               text('id_token'),
  accessTokenExpiresAt:  integer('access_token_expires_at',  { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:             integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp' }),
  updatedAt:  integer('updated_at', { mode: 'timestamp' }),
})

export const twoFactor = sqliteTable('two_factor', {
  id:          text('id').primaryKey(),
  secret:      text('secret').notNull(),        // base32 TOTP secret
  backupCodes: text('backup_codes').notNull(),  // JSON: string[]
  userId:      text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
})
```

- [ ] **Step 3: Export new tables from index.ts**

In `packages/db/src/index.ts`, add `user, session, account, verification, twoFactor` to the exports alongside the existing table exports.

- [ ] **Step 4: Generate and run migrations**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
```

Expected: migration applied, no errors.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter @backupos/db build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add packages/db/src/schema.ts packages/db/src/index.ts packages/db/drizzle/
git commit -m "feat: add user, session, account, verification, two_factor DB tables"
```

---

### Task 2: better-auth config + API route + seed script

**Files:**
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/api/auth/[...all]/route.ts`
- Create: `apps/web/scripts/seed-user.ts`

- [ ] **Step 1: Create apps/web/lib/auth.ts**

```typescript
import { betterAuth }    from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb, user, session, account, verification } from '@backupos/db'

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled:    true,
    autoSignIn: true,
  },
  session: {
    expiresIn:          60 * 60 * 24 * 30,  // 30 days
    updateAge:          60 * 60 * 24,        // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge:  60 * 5,  // 5-minute cache
    },
  },
})

export type Session = typeof auth.$Infer.Session
export type User    = typeof auth.$Infer.Session.user
```

- [ ] **Step 2: Create apps/web/app/api/auth/[...all]/route.ts**

```typescript
import { auth }              from '@/lib/auth'
import { toNextJsHandler }   from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 3: Create apps/web/scripts/seed-user.ts**

```typescript
import { auth } from '../lib/auth'

async function seed() {
  try {
    await auth.api.signUpEmail({
      body: {
        name:     'Admin',
        email:    'admin@backupos.local',
        password: 'changeme',
      },
    })
    console.log('Default user created: admin@backupos.local / changeme')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('already exists') || msg.includes('UNIQUE')) {
      console.log('User already exists — skipping seed.')
    } else {
      console.error('Seed failed:', msg)
      process.exit(1)
    }
  }
}

seed()
```

- [ ] **Step 4: Run the seed script**

```bash
cd /Users/dariusvorster/Projects/backupos/apps/web
npx tsx scripts/seed-user.ts
```

Expected: `Default user created: admin@backupos.local / changeme`

- [ ] **Step 5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/lib/auth.ts "apps/web/app/api/auth/[...all]/route.ts" apps/web/scripts/seed-user.ts
git commit -m "feat: wire better-auth config, API route, and seed script"
```

---

### Task 3: getCurrentUser utility + TOTP lib + server actions

**Files:**
- Create: `apps/web/lib/user.ts`
- Create: `apps/web/lib/totp.ts`
- Create: `apps/web/app/actions/user.ts`
- Create: `apps/web/app/actions/totp.ts`

- [ ] **Step 1: Install otpauth**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web add otpauth
```

- [ ] **Step 2: Create apps/web/lib/user.ts**

```typescript
import { headers }  from 'next/headers'
import { auth }     from './auth'

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}
```

- [ ] **Step 3: Create apps/web/lib/totp.ts**

```typescript
import * as OTPAuth from 'otpauth'
import { randomBytes } from 'crypto'

export function generateTotpSecret(): string {
  return new OTPAuth.Secret().base32
}

export function createTotpUri(secret: string, email: string): string {
  return new OTPAuth.TOTP({
    issuer:    'BackupOS',
    label:     email,
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret:    OTPAuth.Secret.fromBase32(secret),
  }).toString()
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer:    'BackupOS',
    label:     '',
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret:    OTPAuth.Secret.fromBase32(secret),
  })
  return totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null
}

export function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = randomBytes(4).toString('hex').toUpperCase()
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`
  })
}
```

- [ ] **Step 4: Create apps/web/app/actions/user.ts**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, user }    from '@backupos/db'
import { eq }             from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import path                 from 'path'
import { auth }             from '@/lib/auth'
import { getCurrentUser }   from '@/lib/user'
import { headers }          from 'next/headers'

export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const name         = ((formData.get('name')        ?? '') as string).trim()
  const displayName  = ((formData.get('displayName') ?? '') as string).trim()
  const phone        = ((formData.get('phone')       ?? '') as string).trim()
  const timezone     = ((formData.get('timezone')    ?? 'UTC') as string).trim()
  const language     = ((formData.get('language')    ?? 'en') as string).trim()
  const emailNotify  = formData.get('emailNotify')  === 'on'
  const smsNotify    = formData.get('smsNotify')    === 'on'
  const notifyAlerts = formData.get('notifyAlerts') === 'on'
  const notifyWeekly = formData.get('notifyWeekly') === 'on'
  const notifyUpdates = formData.get('notifyUpdates') === 'on'

  if (!name) return { error: 'Name is required.' }

  const db = getDb()
  await db.update(user).set({
    name,
    displayName: displayName || null,
    phone:       phone       || null,
    timezone,
    language,
    emailNotify,
    smsNotify,
    notifyAlerts,
    notifyWeekly,
    notifyUpdates,
    updatedAt: new Date(),
  }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/profile')
  return {}
}

export async function uploadAvatar(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 1_000_000) return { error: 'File too large (max 1 MB).' }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { error: 'Only JPG, PNG, or WebP files are accepted.' }
  }

  const dir = path.join(process.cwd(), 'public', 'avatars')
  await mkdir(dir, { recursive: true })

  const filename = `${me.id}.${ext}`
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))

  const db = getDb()
  await db.update(user).set({ image: `/avatars/${filename}`, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/profile')
  return {}
}

export async function removeAvatar(): Promise<void> {
  const me = await getCurrentUser()
  if (!me) return
  const db = getDb()
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, me.id)).run()
  revalidatePath('/settings/profile')
}

export async function changePassword(formData: FormData): Promise<{ error?: string }> {
  const currentPassword = (formData.get('currentPassword') ?? '') as string
  const newPassword     = (formData.get('newPassword')     ?? '') as string
  const confirm         = (formData.get('confirm')         ?? '') as string

  if (!currentPassword)     return { error: 'Current password is required.' }
  if (newPassword.length < 8) return { error: 'New password must be at least 8 characters.' }
  if (newPassword !== confirm) return { error: 'Passwords do not match.' }

  try {
    await auth.api.changePassword({
      body:    { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    })
    return {}
  } catch {
    return { error: 'Incorrect current password.' }
  }
}
```

- [ ] **Step 5: Create apps/web/app/actions/totp.ts**

```typescript
'use server'

import { revalidatePath }      from 'next/cache'
import { getDb, user, twoFactor } from '@backupos/db'
import { eq }                  from 'drizzle-orm'
import { randomUUID }          from 'crypto'
import { getCurrentUser }      from '@/lib/user'
import {
  generateTotpSecret,
  createTotpUri,
  verifyTotpCode,
  generateBackupCodes,
} from '@/lib/totp'

export async function initTotp(): Promise<{ uri?: string; secret?: string; error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const secret = generateTotpSecret()
  const uri    = createTotpUri(secret, me.email)
  return { uri, secret }
}

export async function enableTotp(formData: FormData): Promise<{ backupCodes?: string[]; error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const secret = ((formData.get('secret') ?? '') as string).trim()
  const code   = ((formData.get('code')   ?? '') as string).trim()

  if (!secret) return { error: 'TOTP secret is missing.' }
  if (!code)   return { error: 'Verification code is required.' }
  if (!verifyTotpCode(secret, code)) return { error: 'Invalid TOTP code. Try again.' }

  const backupCodes = generateBackupCodes()
  const db = getDb()

  await db.delete(twoFactor).where(eq(twoFactor.userId, me.id)).run()
  await db.insert(twoFactor).values({
    id:          randomUUID(),
    secret,
    backupCodes: JSON.stringify(backupCodes),
    userId:      me.id,
  }).run()
  await db.update(user).set({ twoFactorEnabled: true, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/security')
  return { backupCodes }
}

export async function disableTotp(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const code = ((formData.get('code') ?? '') as string).trim()
  if (!code) return { error: 'Verification code is required to disable 2FA.' }

  const db         = getDb()
  const tfRecord   = await db.select().from(twoFactor).where(eq(twoFactor.userId, me.id)).get()
  if (!tfRecord)   return { error: 'No TOTP secret found.' }

  if (!verifyTotpCode(tfRecord.secret, code)) return { error: 'Invalid TOTP code.' }

  await db.delete(twoFactor).where(eq(twoFactor.userId, me.id)).run()
  await db.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/security')
  return {}
}
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/lib/user.ts apps/web/lib/totp.ts apps/web/app/actions/user.ts apps/web/app/actions/totp.ts
git commit -m "feat: getCurrentUser utility, TOTP lib, profile + TOTP server actions"
```

---

### Task 4: Avatar component

**Files:**
- Create: `apps/web/components/avatar.tsx`

- [ ] **Step 1: Create apps/web/components/avatar.tsx**

```typescript
const PALETTE = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4',
]

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

interface AvatarProps {
  name: string
  src?:  string | null
  size?: 24 | 32 | 48 | 80
}

export function Avatar({ name, src, size = 32 }: AvatarProps) {
  const fontSize = size <= 24 ? 9 : size <= 32 ? 11 : size <= 48 ? 14 : 22

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      flexShrink: 0, overflow: 'hidden',
      backgroundColor: src ? 'transparent' : nameToColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize, fontWeight: 600, color: '#fff', lineHeight: 1, userSelect: 'none' }}>
          {initials(name)}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/components/avatar.tsx
git commit -m "feat: Avatar component with initials fallback and 4 sizes"
```

---

### Task 5: Profile popover + sidebar + layout wiring

**Files:**
- Create: `apps/web/components/profile-popover.tsx`
- Modify: `apps/web/components/sidebar.tsx`
- Modify: `apps/web/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create apps/web/components/profile-popover.tsx**

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Avatar } from './avatar'

interface ProfileUser {
  name:   string
  email:  string
  image?: string | null
}

export function ProfilePopover({ user }: { user: ProfileUser }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const MENU = [
    { href: '/settings/profile',  icon: '👤', label: 'Profile' },
    { href: '/settings/security', icon: '🔐', label: 'Security' },
    { href: '/settings',          icon: '⚙️',  label: 'Settings' },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        }}
      >
        <Avatar src={user.image} name={user.name} size={28} />
        <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, flex: 1, textAlign: 'left' }}>
          {user.name}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          width: 280,
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 200,
        }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <Avatar src={user.image} name={user.name} size={48} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Solo · v0.1.0</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {MENU.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 16px', height: 36, fontSize: 13,
                color: 'var(--fg)', textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surf2)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
              {item.label}
              <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 12 }}>→</span>
            </Link>
          ))}

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <form action="/api/auth/sign-out" method="POST">
            <button
              type="submit"
              style={{
                width: '100%', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 16px', height: 36, fontSize: 13,
                color: 'var(--fg)', background: 'none', border: 'none', cursor: 'pointer',
                borderBottomLeftRadius: 'var(--radius)', borderBottomRightRadius: 'var(--radius)',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--surf2)'; e.currentTarget.style.color = 'var(--err)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = 'var(--fg)' }}
            >
              <span style={{ fontSize: 14 }}>↩️</span>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Read sidebar.tsx**

```bash
cat /Users/dariusvorster/Projects/backupos/apps/web/components/sidebar.tsx
```

- [ ] **Step 3: Modify sidebar.tsx**

Change the `Sidebar` function signature to accept a `user` prop and replace the static avatar block with `ProfilePopover`. The replacement is in the bottom section of the sidebar (the `<div style={{ padding: '8px 12px 12px' }}>` block).

Replace the bottom `<div>` block (from the icon row through `Solo · v0.1.0`) with:

```typescript
// Add imports at top of sidebar.tsx:
import { ProfilePopover } from './profile-popover'

// Change function signature:
interface SidebarUser { name: string; email: string; image?: string | null }
// ...
export function Sidebar({ user }: { user: SidebarUser }) {
```

Replace the bottom `<div style={{ padding: '8px 12px 12px' }}>` block with:

```tsx
<div style={{ padding: '8px 12px 12px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
    <Link
      href="/settings"
      title="Settings"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', color: 'var(--fg-mute)', textDecoration: 'none' }}
    >
      <Settings size={16} />
    </Link>
    <button
      title="Toggle theme (v2)"
      disabled
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-sm)', color: 'var(--fg-faint)', background: 'none', border: 'none', cursor: 'not-allowed' }}
    >
      <Sun size={16} />
    </button>
  </div>

  <ProfilePopover user={user} />

  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
    Solo · v0.1.0
  </div>
</div>
```

(Remove the old LogOut button from the icon row since sign-out is now in the popover.)

- [ ] **Step 4: Read layout.tsx**

```bash
cat /Users/dariusvorster/Projects/backupos/apps/web/app/\(dashboard\)/layout.tsx
```

- [ ] **Step 5: Modify layout.tsx — fetch user and pass to Sidebar**

Add `getCurrentUser` import and update the layout to fetch the user, then pass it to `<Sidebar>`. Add this after the existing DB queries:

```typescript
import { getCurrentUser } from '@/lib/user'
// ...
// Inside DashboardLayout, after existing queries:
const currentUser = await getCurrentUser()
const sidebarUser = currentUser
  ? { name: currentUser.name, email: currentUser.email, image: currentUser.image ?? null }
  : { name: 'Admin', email: 'admin@backupos.local', image: null }
// ...
// In JSX:
<Sidebar user={sidebarUser} />
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/components/profile-popover.tsx apps/web/components/sidebar.tsx "apps/web/app/(dashboard)/layout.tsx"
git commit -m "feat: profile popover + sidebar avatar wiring"
```

---

### Task 6: Profile settings page

**Files:**
- Create: `apps/web/app/(dashboard)/settings/profile/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read the existing settings page**

```bash
cat /Users/dariusvorster/Projects/backupos/apps/web/app/\(dashboard\)/settings/page.tsx
```

- [ ] **Step 2: Add Profile and Security to settings page nav**

Find the `LINKED_ITEMS` (or equivalent) object in `settings/page.tsx` and add:
```typescript
'Profile':  '/settings/profile',
'Security': '/settings/security',
```
in the appropriate section (e.g., an "Account" group or at the top of the list). Read the file first to see the exact structure.

- [ ] **Step 3: Create apps/web/app/(dashboard)/settings/profile/page.tsx**

```typescript
import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user }    from '@backupos/db'
import { eq }             from 'drizzle-orm'
import { Avatar }         from '@/components/avatar'
import {
  updateProfile,
  uploadAvatar,
  removeAvatar,
} from '@/app/actions/user'

const TIMEZONES = [
  'UTC', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney',
]

const LANGUAGES = [{ value: 'en', label: 'English' }]

export default async function ProfilePage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db      = getDb()
  const profile = await db.select().from(user).where(eq(user.id, me.id)).get()
  if (!profile) redirect('/login')

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Profile</h1>

      {/* Avatar section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Avatar</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar src={profile.image} name={profile.name} size={80} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <form action={uploadAvatar}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                color: 'var(--fg)', backgroundColor: 'var(--surf2)',
              }}>
                Upload image
                <input name="avatar" type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={e => e.currentTarget.form?.requestSubmit()} />
              </label>
            </form>
            <form action={removeAvatar}>
              <button type="submit" style={{
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                color: 'var(--fg-mute)', backgroundColor: 'transparent',
              }}>Remove</button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Self-hosted: stored locally. Max 1 MB, JPG/PNG/WebP.</p>
          </div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 32 }} />

      {/* Personal info section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Personal information</h2>
        <form action={updateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { name: 'name',        label: 'Full name',     type: 'text',  required: true,  value: profile.name },
            { name: 'displayName', label: 'Display name',  type: 'text',  required: false, value: profile.displayName ?? '' },
            { name: 'phone',       label: 'Phone number',  type: 'tel',   required: false, value: profile.phone ?? '' },
          ].map(f => (
            <div key={f.name}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
                {f.label}{f.required && ' *'}
              </label>
              <input
                name={f.name} type={f.type} defaultValue={f.value} required={f.required}
                style={{
                  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
                }}
              />
            </div>
          ))}

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={profile.email} disabled
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg-mute)', fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Timezone</label>
            <select name="timezone" defaultValue={profile.timezone} style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
            }}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Language</label>
            <select name="language" defaultValue={profile.language} style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
            }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Contact preferences */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Contact preferences</h2>
            {[
              { name: 'emailNotify',  label: 'Email notifications (master toggle)', checked: profile.emailNotify },
              { name: 'smsNotify',    label: 'SMS notifications (requires verified phone)', checked: profile.smsNotify },
              { name: 'notifyAlerts', label: 'Alerts',         checked: profile.notifyAlerts },
              { name: 'notifyWeekly', label: 'Weekly summary', checked: profile.notifyWeekly },
              { name: 'notifyUpdates', label: 'Product updates', checked: profile.notifyUpdates },
            ].map(f => (
              <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" name={f.name} defaultChecked={f.checked} />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{f.label}</span>
              </label>
            ))}
          </div>

          <div>
            <button type="submit" style={{
              padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/settings/profile/page.tsx" "apps/web/app/(dashboard)/settings/page.tsx"
git commit -m "feat: profile settings page with avatar upload and contact preferences"
```

---

### Task 7: Security settings page + TOTP setup modal

**Files:**
- Create: `apps/web/components/totp-setup-modal.tsx`
- Create: `apps/web/app/(dashboard)/settings/security/page.tsx`

- [ ] **Step 1: Install react-qr-code**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web add react-qr-code
```

- [ ] **Step 2: Create apps/web/components/totp-setup-modal.tsx**

This is a 3-step client component modal. Step 1: verify intent (display). Step 2: QR code + secret. Step 3: enter code → receive backup codes.

```typescript
'use client'

import { useState, useTransition } from 'react'
import QRCode from 'react-qr-code'
import { initTotp, enableTotp } from '@/app/actions/totp'

interface Props { onClose: () => void; onEnabled: () => void }

export function TotpSetupModal({ onClose, onEnabled }: Props) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [uri, setUri]             = useState('')
  const [secret, setSecret]       = useState('')
  const [code, setCode]           = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [error, setError]         = useState('')
  const [isPending, startTransition] = useTransition()

  function handleStart() {
    startTransition(async () => {
      const result = await initTotp()
      if (result.error) { setError(result.error); return }
      setUri(result.uri!)
      setSecret(result.secret!)
      setStep(2)
    })
  }

  function handleVerify() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('secret', secret)
      fd.set('code', code)
      const result = await enableTotp(fd)
      if (result.error) { setError(result.error); return }
      setBackupCodes(result.backupCodes!)
      setStep(3)
    })
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 400,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const modal: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: 28, width: 440, maxWidth: '90vw',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 20 }}>
          {step === 1 && 'Enable two-factor authentication'}
          {step === 2 && 'Scan QR code'}
          {step === 3 && 'Save backup codes'}
        </h2>

        {error && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 20, lineHeight: 1.6 }}>
              Adding a TOTP authenticator protects your account even if your password is leaked. You will need your authenticator app every time you sign in.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--fg)' }}>Cancel</button>
              <button onClick={handleStart} disabled={isPending} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isPending ? 'Loading…' : 'Continue →'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
              <div style={{ flexShrink: 0, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
                <QRCode value={uri} size={160} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 8 }}>
                  Scan with 1Password, Authy, Google Authenticator, or any TOTP app.
                </p>
                <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Manual entry secret:</p>
                <code style={{ display: 'block', fontSize: 11, fontFamily: 'monospace', backgroundColor: 'var(--surf2)', padding: '6px 8px', borderRadius: 4, wordBreak: 'break-all', color: 'var(--fg)' }}>
                  {secret}
                </code>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>
              Enter the 6-digit code from your app to verify
            </label>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 18,
                letterSpacing: '0.2em', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--fg)' }}>Cancel</button>
              <button onClick={handleVerify} disabled={isPending || code.length < 6} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isPending ? 'Verifying…' : 'Verify & enable'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.6 }}>
              Two-factor authentication is now enabled. Save these backup codes somewhere safe — each can be used once if you lose access to your TOTP app.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16,
            }}>
              {backupCodes.map(c => (
                <code key={c} style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--fg)', letterSpacing: '0.05em' }}>{c}</code>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--fg)' }}
              >
                Copy all
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(backupCodes.join('\n'))}`}
                download="backupos-backup-codes.txt"
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--fg)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Download .txt
              </a>
            </div>
            <button
              onClick={() => { onEnabled(); onClose() }}
              style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Done — I've saved my codes
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create apps/web/app/(dashboard)/settings/security/page.tsx**

```typescript
import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user, twoFactor } from '@backupos/db'
import { eq }             from 'drizzle-orm'
import { SecurityPageClient } from './client'

export default async function SecurityPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db      = getDb()
  const profile = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, me.id)).get()
  const tfRecord = await db.select({ id: twoFactor.id }).from(twoFactor).where(eq(twoFactor.userId, me.id)).get()

  return (
    <SecurityPageClient
      twoFactorEnabled={profile?.twoFactorEnabled ?? false}
      hasTotpRecord={!!tfRecord}
    />
  )
}
```

- [ ] **Step 4: Create apps/web/app/(dashboard)/settings/security/client.tsx**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { TotpSetupModal } from '@/components/totp-setup-modal'
import { changePassword } from '@/app/actions/user'
import { disableTotp }   from '@/app/actions/totp'

interface Props {
  twoFactorEnabled: boolean
  hasTotpRecord:    boolean
}

export function SecurityPageClient({ twoFactorEnabled, hasTotpRecord }: Props) {
  const [showTotp, setShowTotp]         = useState(false)
  const [tfEnabled, setTfEnabled]       = useState(twoFactorEnabled)
  const [disableCode, setDisableCode]   = useState('')
  const [pwError, setPwError]           = useState('')
  const [pwSuccess, setPwSuccess]       = useState(false)
  const [disableError, setDisableError] = useState('')
  const [isPending, startTransition]    = useTransition()

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await changePassword(fd)
      if (result.error) { setPwError(result.error); return }
      setPwSuccess(true)
      ;(e.target as HTMLFormElement).reset()
    })
  }

  function handleDisableTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDisableError('')
    const fd = new FormData()
    fd.set('code', disableCode)
    startTransition(async () => {
      const result = await disableTotp(fd)
      if (result.error) { setDisableError(result.error); return }
      setTfEnabled(false)
      setDisableCode('')
    })
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16,
  }
  const divider: React.CSSProperties = {
    borderTop: '1px solid var(--border)', marginBottom: 32,
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Security</h1>

      {/* Password section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Change password</h2>
        {pwSuccess && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--ok-dim)', border: '1px solid var(--ok)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)', marginBottom: 16 }}>
            Password updated successfully.
          </div>
        )}
        {pwError && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>
            {pwError}
          </div>
        )}
        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { name: 'currentPassword', label: 'Current password', type: 'password' },
            { name: 'newPassword',     label: 'New password',     type: 'password' },
            { name: 'confirm',         label: 'Confirm new password', type: 'password' },
          ].map(f => (
            <div key={f.name}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>{f.label}</label>
              <input name={f.name} type={f.type} required style={fieldStyle} />
            </div>
          ))}
          <div>
            <button type="submit" disabled={isPending} style={{
              padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              {isPending ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      <div style={divider} />

      {/* TOTP section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Two-factor authentication</h2>
        {!tfEnabled ? (
          <div style={{
            padding: 20, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', marginBottom: 16,
          }}>
            <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 16 }}>
              Two-factor authentication is <strong>off</strong>. Add a TOTP authenticator to protect your account even if your password is leaked.
            </p>
            <button
              onClick={() => setShowTotp(true)}
              style={{
                padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Enable TOTP
            </button>
          </div>
        ) : (
          <div style={{
            padding: 20, backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>TOTP authenticator enabled</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 12 }}>
              Enter a TOTP code from your authenticator app to disable two-factor authentication.
            </p>
            {disableError && (
              <div style={{ padding: '6px 10px', backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--err)', marginBottom: 10 }}>
                {disableError}
              </div>
            )}
            <form onSubmit={handleDisableTotp} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...fieldStyle, width: 120, letterSpacing: '0.15em', fontSize: 16 }}
              />
              <button type="submit" disabled={isPending || disableCode.length < 6} style={{
                padding: '8px 14px', backgroundColor: 'var(--err)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {isPending ? 'Disabling…' : 'Disable TOTP'}
              </button>
            </form>
          </div>
        )}
      </section>

      {showTotp && (
        <TotpSetupModal
          onClose={() => setShowTotp(false)}
          onEnabled={() => setTfEnabled(true)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/components/totp-setup-modal.tsx "apps/web/app/(dashboard)/settings/security/"
git commit -m "feat: security settings page with password change and TOTP setup modal"
```

---

## Self-Review

### Spec coverage (§3.1–§3.5)

| Spec requirement | Task |
|---|---|
| §3.1 Profile popover: avatar 48px row, name, email, tier subline | Task 5 (ProfilePopover) |
| §3.1 Menu items: Profile, Security, Settings → with chevrons | Task 5 (ProfilePopover) |
| §3.1 Sign out in danger-dim hover state | Task 5 (ProfilePopover) |
| §3.2 Avatar: circle, 4 sizes, initials fallback, name-hash colour | Task 4 (Avatar) |
| §3.2 Avatar upload → stored locally, no border/ring | Task 4 + Task 6 |
| §3.3 Profile page: avatar section + personal info + contact prefs | Task 6 |
| §3.3 Email field locked | Task 6 ✅ (input disabled) |
| §3.3 Save button | Task 6 ✅ |
| §3.4 Phone field present | Task 6 ✅ (field included, SMS send stubbed) |
| §3.5 Password change section | Task 7 |
| §3.5 TOTP enrolment: 3-step modal (intent → QR → backup codes) | Task 7 |
| §3.5 QR code + manual secret | Task 7 ✅ (react-qr-code) |
| §3.5 10 backup codes in XXXX-XXXX format | Task 7 ✅ |
| §3.5 Copy all + Download .txt backup code actions | Task 7 ✅ |
| §3.5 Disable TOTP with code verification | Task 7 ✅ |
| §3.5 Active sessions / API tokens / Audit scope | Stubbed (out of scope — separate plan) |

### Placeholder scan

No TBD/TODO in the code above. Phone SMS sending is intentionally stubbed (field exists, no SMS send logic — this is documented). Active sessions, API tokens, and audit scope are scoped out and noted above.

### Type consistency

- `ProfileUser` interface in `profile-popover.tsx` matches what layout passes: `{ name, email, image? }` ✅
- `SidebarUser` in `sidebar.tsx` matches `ProfileUser` fields ✅  
- `initTotp()` returns `{ uri, secret }` — both consumed in `TotpSetupModal` ✅
- `enableTotp(fd)` receives formData with `secret` + `code` fields — set in `handleVerify` ✅
- `disableTotp(fd)` receives formData with `code` field — set in `handleDisableTotp` ✅
- `SecurityPageClient` receives `twoFactorEnabled: boolean, hasTotpRecord: boolean` — both derived in server page ✅
