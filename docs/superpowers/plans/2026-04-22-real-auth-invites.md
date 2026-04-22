# Real Auth & User Invites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two auth bugs (sign-out, null-session redirect) and add an admin invite system so additional users can join via a single-use link, with optional SMTP email delivery.

**Architecture:** Server actions handle all invite mutations (create, revoke, accept) following the existing settings-page pattern. `better-auth`'s internal `auth.api.signUpEmail` creates the account server-side during invite acceptance; the client then calls `authClient.signIn.email` to obtain a session cookie. Nodemailer provides optional SMTP delivery — if `SMTP_HOST` is absent the email step is silently skipped.

**Tech Stack:** Next.js 15 App Router, better-auth, Drizzle ORM + SQLite, nodemailer (new dep), tRPC (existing), TypeScript strict

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/web/components/profile-popover.tsx` | Fix sign-out to use `authClient.signOut()` |
| Modify | `apps/web/app/(dashboard)/layout.tsx` | Redirect to `/login` when session is null |
| Modify | `packages/db/src/schema.ts` | Add `invite` table |
| Create | `apps/web/lib/mailer.ts` | Nodemailer wrapper; no-op if SMTP not configured |
| Create | `apps/web/app/actions/invite.ts` | `createInvite`, `revokeInvite`, `acceptInvite` server actions |
| Create | `apps/web/app/(dashboard)/settings/users/page.tsx` | Server component: loads users + pending invites |
| Create | `apps/web/app/(dashboard)/settings/users/client.tsx` | Client component: invite form, copy link, revoke |
| Modify | `apps/web/app/(dashboard)/settings/page.tsx` | Add "Users" entry to Security section |
| Create | `apps/web/app/(auth)/signup/invite-form.tsx` | Invite acceptance form (client component) |
| Modify | `apps/web/app/(auth)/signup/page.tsx` | Route: first-run → open signup, token → invite form, else → redirect /login |

---

## Task 1: Fix sign-out in profile popover

**Files:**
- Modify: `apps/web/components/profile-popover.tsx`

The current sign-out uses `<form action="/api/auth/sign-out" method="POST">` which doesn't include the JSON content-type that better-auth expects. Replace it with `authClient.signOut()`.

- [ ] **Step 1: Read the file**

```bash
cat apps/web/components/profile-popover.tsx
```

- [ ] **Step 2: Replace the sign-out button**

The file currently imports `useState`, `useRef`, `useEffect`, `Link`, `Avatar`, and icons. Add `useRouter` from `next/navigation` and `authClient` from `@/lib/auth-client`.

Replace the import block at the top of the file:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from './avatar'
import { authClient } from '@/lib/auth-client'
import {
  IconUser, IconLock, IconSettings, IconLogOut,
} from '@/app/(dashboard)/docs/icons'
```

Add `const router = useRouter()` and `async function handleSignOut()` inside the `ProfilePopover` component body, before the `MENU` constant:

```tsx
const router = useRouter()

async function handleSignOut() {
  await authClient.signOut()
  router.push('/login')
}
```

Replace the entire `<form action="/api/auth/sign-out" method="POST">` block (the last child of the popover div, after the second `<div style={{ borderTop: ... }} />`) with:

```tsx
<button
  type="button"
  onClick={handleSignOut}
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
  <MenuIcon Icon={IconLogOut} />
  Sign out
</button>
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/profile-popover.tsx
git commit -m "fix(auth): sign out via authClient.signOut() instead of form POST"
```

---

## Task 2: Redirect on null session in dashboard layout

**Files:**
- Modify: `apps/web/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Read the file**

```bash
cat apps/web/app/\(dashboard\)/layout.tsx
```

- [ ] **Step 2: Add redirect import and guard**

At the top of the file, add `redirect` to the existing `next/navigation` import (or add the import if not present):

```tsx
import { redirect } from 'next/navigation'
```

Find the line `const currentUser = await getCurrentUser()` inside `DashboardLayout`. Immediately after it, add:

```tsx
if (!currentUser) redirect('/login')
```

Then replace the `sidebarUser` assignment. The current code has a fallback for null users — remove it:

```tsx
const sidebarUser = {
  name:  currentUser.name,
  email: currentUser.email,
  image: currentUser.image ?? null,
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/layout.tsx
git commit -m "fix(auth): redirect to /login when dashboard session is null"
```

---

## Task 3: Add invite table to DB schema + generate migration

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Read schema.ts to find insertion point**

```bash
tail -40 packages/db/src/schema.ts
```

- [ ] **Step 2: Add the invite table**

Append the following to `packages/db/src/schema.ts` (after the last existing `sqliteTable` definition):

```ts
// ─── User Invites ───────────────────────────────────────────────────────────

export const invite = sqliteTable('invite', {
  id:        text('id').primaryKey(),
  email:     text('email').notNull(),
  name:      text('name'),
  token:     text('token').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt:    integer('used_at'),
  createdAt: integer('created_at').notNull(),
})
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm --filter @backupos/db db:generate
```

Expected: a new file `packages/db/migrations/0016_*.sql` is created containing the `CREATE TABLE invite` statement.

- [ ] **Step 4: Apply the migration**

The migration must run against the actual app database. Set `DATABASE_URL` to the web app's data directory:

```bash
DATABASE_URL=file:../../apps/web/data/backupos.db pnpm --filter @backupos/db db:migrate
```

If the database file doesn't exist yet (fresh install), run the web app once first to create it, then re-run this command.

Expected output: `[✓] migrations applied` (or similar drizzle-kit success message).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat(db): add invite table with single-use token and expiry"
```

---

## Task 4: Install nodemailer + create mailer helper

**Files:**
- Create: `apps/web/lib/mailer.ts`

- [ ] **Step 1: Install nodemailer**

```bash
pnpm --filter @backupos/web add nodemailer
pnpm --filter @backupos/web add -D @types/nodemailer
```

Expected: `nodemailer` appears in `apps/web/package.json` dependencies.

- [ ] **Step 2: Create lib/mailer.ts**

```ts
// apps/web/lib/mailer.ts
import nodemailer from 'nodemailer'

interface InviteEmailOpts {
  to:          string
  inviterName: string
  link:        string
}

export async function sendInviteEmail(opts: InviteEmailOpts): Promise<void> {
  const host = process.env['SMTP_HOST']
  if (!host) return // SMTP not configured — skip silently

  const transporter = nodemailer.createTransport({
    host,
    port:   Number(process.env['SMTP_PORT'] ?? 587),
    secure: Number(process.env['SMTP_PORT'] ?? 587) === 465,
    auth: {
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS'],
    },
  })

  const from = process.env['SMTP_FROM'] ?? `BackupOS <noreply@backupos.dev>`

  await transporter.sendMail({
    from,
    to:      opts.to,
    subject: `${opts.inviterName} invited you to BackupOS`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:system-ui,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:12px;overflow:hidden">
    <div style="padding:32px 32px 24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="#1A1206"/>
          <rect x="4" y="4" width="19" height="19" fill="#F5A623"/>
          <rect x="25" y="4" width="19" height="19" fill="#854F0B"/>
          <rect x="4" y="25" width="19" height="19" fill="#854F0B"/>
          <rect x="25" y="25" width="19" height="19" fill="#C77A14"/>
          <rect x="19" y="19" width="10" height="10" fill="#FEF5E0"/>
        </svg>
        <span style="color:#F5F5F5;font-size:16px;font-weight:600">BackupOS</span>
      </div>
      <h1 style="color:#F5F5F5;font-size:20px;font-weight:700;margin:0 0 8px">You've been invited</h1>
      <p style="color:#A3A3A3;font-size:14px;margin:0 0 28px">
        <strong style="color:#F5F5F5">${opts.inviterName}</strong> invited you to join BackupOS.
      </p>
      <a href="${opts.link}"
         style="display:inline-block;padding:10px 24px;background:#F5A623;color:#000;font-size:14px;font-weight:600;border-radius:6px;text-decoration:none">
        Accept invitation
      </a>
      <p style="color:#6B6B6B;font-size:12px;margin:24px 0 0">
        This link expires in 7 days. If you didn't expect this invitation, ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
  })
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/mailer.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(mailer): nodemailer SMTP helper for invite emails"
```

---

## Task 5: Server actions — createInvite, revokeInvite, acceptInvite

**Files:**
- Create: `apps/web/app/actions/invite.ts`

- [ ] **Step 1: Create the server actions file**

```ts
// apps/web/app/actions/invite.ts
'use server'

import { getDb, invite, user } from '@backupos/db'
import { eq, and, isNull }    from 'drizzle-orm'
import { auth }               from '@/lib/auth'
import { getCurrentUser }     from '@/lib/user'
import { sendInviteEmail }    from '@/lib/mailer'

const BASE_URL = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'

// ─── createInvite ──────────────────────────────────────────────────────────
// Creates a single-use invite token, returns the invite link.
// If SMTP is configured, also sends the invite email (silently ignores failures).
export async function createInvite(
  formData: FormData,
): Promise<{ link?: string; error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }

  const email = (formData.get('email') as string | null)?.trim()
  const name  = (formData.get('name')  as string | null)?.trim() || null

  if (!email) return { error: 'Email is required' }

  const db    = getDb()
  const id    = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now   = Date.now()

  await db.insert(invite).values({
    id,
    email,
    name,
    token,
    createdBy: currentUser.id,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    usedAt:    null,
    createdAt: now,
  })

  const link = `${BASE_URL}/signup?token=${token}`

  await sendInviteEmail({ to: email, inviterName: currentUser.name, link }).catch(() => {})

  return { link }
}

// ─── revokeInvite ──────────────────────────────────────────────────────────
// Deletes a pending (not yet used) invite.
export async function revokeInvite(id: string): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }

  const db = getDb()
  await db.delete(invite).where(and(eq(invite.id, id), isNull(invite.usedAt)))
  return {}
}

// ─── acceptInvite ──────────────────────────────────────────────────────────
// Public (no auth required). Validates token, creates the user account,
// marks the invite as used. Returns the email so the client can sign in.
export async function acceptInvite(
  token:    string,
  name:     string,
  password: string,
): Promise<{ email?: string; error?: string }> {
  const db  = getDb()
  const now = Date.now()

  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.token, token))
    .limit(1)

  if (!row)                return { error: 'Invalid invite link' }
  if (row.usedAt !== null) return { error: 'This invite has already been used' }
  if (row.expiresAt < now) return { error: 'This invite has expired' }

  // Mark used before creating account to prevent concurrent accepts
  await db.update(invite).set({ usedAt: now }).where(eq(invite.token, token))

  try {
    await auth.api.signUpEmail({
      body: { email: row.email, name: name.trim() || row.name || row.email, password },
    })
  } catch (err) {
    // Roll back the usedAt so the invite can be retried
    await db.update(invite).set({ usedAt: null }).where(eq(invite.token, token))
    const msg = err instanceof Error ? err.message : 'Could not create account'
    return { error: msg }
  }

  return { email: row.email }
}

// ─── resendInviteEmail ─────────────────────────────────────────────────────
// Re-sends the invite email for an existing pending invite (does not create a new token).
export async function resendInviteEmail(id: string): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }

  const db  = getDb()
  const now = Date.now()

  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.id, id))
    .limit(1)

  if (!row)                return { error: 'Invite not found' }
  if (row.usedAt !== null) return { error: 'Invite already used' }
  if (row.expiresAt < now) return { error: 'Invite has expired' }

  const baseUrl = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'
  const link    = `${baseUrl}/signup?token=${row.token}`

  await sendInviteEmail({ to: row.email, inviterName: currentUser.name, link })
  return {}
}

// ─── getInviteByToken ──────────────────────────────────────────────────────
// Used server-side by the signup page to validate + prefill the form.
export async function getInviteByToken(token: string): Promise<{
  email:       string
  name:        string | null
  inviterName: string
  valid:       boolean
  reason?:     string
} | null> {
  const db  = getDb()
  const now = Date.now()

  const [row] = await db
    .select({
      email:     invite.email,
      name:      invite.name,
      usedAt:    invite.usedAt,
      expiresAt: invite.expiresAt,
      createdBy: invite.createdBy,
    })
    .from(invite)
    .where(eq(invite.token, token))
    .limit(1)

  if (!row) return null

  const [inviter] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, row.createdBy))
    .limit(1)

  if (row.usedAt !== null) {
    return { email: row.email, name: row.name, inviterName: inviter?.name ?? 'Someone', valid: false, reason: 'used' }
  }
  if (row.expiresAt < now) {
    return { email: row.email, name: row.name, inviterName: inviter?.name ?? 'Someone', valid: false, reason: 'expired' }
  }

  return { email: row.email, name: row.name, inviterName: inviter?.name ?? 'Someone', valid: true }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/actions/invite.ts
git commit -m "feat(invite): createInvite, revokeInvite, acceptInvite server actions"
```

---

## Task 6: /settings/users page

**Files:**
- Create: `apps/web/app/(dashboard)/settings/users/page.tsx`
- Create: `apps/web/app/(dashboard)/settings/users/client.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create the server component (page.tsx)**

```tsx
// apps/web/app/(dashboard)/settings/users/page.tsx
import { redirect }      from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user, invite } from '@backupos/db'
import { UsersClient }   from './client'

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const db = getDb()

  const [users, invites] = await Promise.all([
    db.select({
      id:        user.id,
      name:      user.name,
      email:     user.email,
      createdAt: user.createdAt,
    }).from(user).all(),

    db.select({
      id:        invite.id,
      email:     invite.email,
      name:      invite.name,
      token:     invite.token,
      expiresAt: invite.expiresAt,
      usedAt:    invite.usedAt,
      createdAt: invite.createdAt,
    }).from(invite).all(),
  ])

  const baseUrl    = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'
  const smtpConfigured = !!process.env['SMTP_HOST']

  return (
    <UsersClient
      users={users.map(u => ({ ...u, createdAt: u.createdAt?.getTime() ?? 0 }))}
      invites={invites}
      baseUrl={baseUrl}
      smtpConfigured={smtpConfigured}
      currentUserId={currentUser.id}
    />
  )
}
```

- [ ] **Step 2: Create the client component (client.tsx)**

```tsx
// apps/web/app/(dashboard)/settings/users/client.tsx
'use client'

import { useState, useTransition } from 'react'
import { createInvite, revokeInvite, resendInviteEmail } from '@/app/actions/invite'

interface UserRow {
  id:        string
  name:      string
  email:     string
  createdAt: number
}

interface InviteRow {
  id:        string
  email:     string
  name:      string | null
  token:     string
  expiresAt: number
  usedAt:    number | null
  createdAt: number
}

interface Props {
  users:         UserRow[]
  invites:       InviteRow[]
  baseUrl:       string
  smtpConfigured: boolean
  currentUserId: string
}

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function UsersClient({ users, invites: initialInvites, baseUrl, smtpConfigured, currentUserId }: Props) {
  const [invites, setInvites]   = useState(initialInvites)
  const [newLink, setNewLink]   = useState<string | null>(null)
  const [copied,  setCopied]    = useState(false)
  const [error,   setError]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [resentId, setResentId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const pending_invites = invites.filter(i => i.usedAt === null && i.expiresAt > Date.now())

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setNewLink(null)
    const fd = new FormData(e.currentTarget)
    const result = await createInvite(fd)
    if (result.error) { setError(result.error); return }
    setNewLink(result.link!)
    setShowForm(false)
    ;(e.target as HTMLFormElement).reset()
    // Refresh pending invites by re-fetching — use optimistic update instead
    const token = result.link!.split('token=')[1]
    const email = fd.get('email') as string
    const name  = fd.get('name')  as string | null
    setInvites(prev => [...prev, {
      id: crypto.randomUUID(), email, name, token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      usedAt: null, createdAt: Date.now(),
    }])
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeInvite(id)
      setInvites(prev => prev.filter(i => i.id !== id))
    })
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-fg)',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }

  const btnGhost: React.CSSProperties = {
    padding: '6px 12px', background: 'var(--surf2)', color: 'var(--fg)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    fontSize: 12, cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Users</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '4px 0 0' }}>
            Manage who has access to this BackupOS installation.
            {!smtpConfigured && <span style={{ color: 'var(--warn)' }}> · SMTP not configured — invites are link-only.</span>}
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Cancel' : 'Invite user'}
        </button>
      </div>

      {/* Invite form */}
      {showForm && (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Send an invite</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Email *</label>
                <input name="email" type="email" required placeholder="colleague@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Name (optional)</label>
                <input name="name" type="text" placeholder="Jane Doe" style={inputStyle} />
              </div>
            </div>
            {error && <div style={{ fontSize: 13, color: 'var(--err)', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={btnPrimary} disabled={pending}>
              {smtpConfigured ? 'Send invite email + get link' : 'Create invite link'}
            </button>
          </form>
        </div>
      )}

      {/* New link success banner */}
      {newLink && (
        <div style={{ backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)', marginBottom: 4 }}>Invite created{smtpConfigured ? ' — email sent' : ''}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', wordBreak: 'break-all' }}>{newLink}</div>
          </div>
          <button style={btnGhost} onClick={() => copyLink(newLink)}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}

      {/* Active users */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Active users ({users.length})
        </div>
        {users.map((u, i) => (
          <div key={u.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
            }}>
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                {u.name}
                {u.id === currentUserId && <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 8 }}>you</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{u.email}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0 }}>Joined {fmt(u.createdAt)}</div>
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {pending_invites.length > 0 && (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            Pending invites ({pending_invites.length})
          </div>
          {pending_invites.map((inv, i) => {
            const link = `${baseUrl}/signup?token=${inv.token}`
            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{inv.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Expires {fmt(inv.expiresAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button style={btnGhost} onClick={() => copyLink(link)}>Copy link</button>
                  {smtpConfigured && (
                    <button
                      style={btnGhost}
                      onClick={() => startTransition(async () => {
                        await resendInviteEmail(inv.id)
                        setResentId(inv.id)
                        setTimeout(() => setResentId(null), 2000)
                      })}
                      disabled={pending}
                    >
                      {resentId === inv.id ? '✓ Sent' : 'Resend email'}
                    </button>
                  )}
                  <button
                    style={{ ...btnGhost, color: 'var(--err)', borderColor: 'color-mix(in srgb, var(--err) 40%, transparent)' }}
                    onClick={() => handleRevoke(inv.id)}
                    disabled={pending}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add "Users" to settings index**

Read `apps/web/app/(dashboard)/settings/page.tsx`. Find the `LINKED_ITEMS` object. Add:

```ts
'Users': '/settings/users',
```

Find the Security section in the sections array. Its `items` currently is `['Change password', 'API tokens', 'Session management']`. Add `'Users'` to the front:

```ts
{ title: 'Security', items: ['Users', 'Change password', 'API tokens', 'Session management'] },
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/users/ apps/web/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(settings): /settings/users page — invite management"
```

---

## Task 7: Invite acceptance page

**Files:**
- Create: `apps/web/app/(auth)/signup/invite-form.tsx`
- Modify: `apps/web/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create invite-form.tsx**

```tsx
// apps/web/app/(auth)/signup/invite-form.tsx
'use client'

import { useState }    from 'react'
import { useRouter }   from 'next/navigation'
import { authClient }  from '@/lib/auth-client'
import { acceptInvite } from '@/app/actions/invite'

interface Props {
  token:       string
  email:       string
  name:        string | null
  inviterName: string
}

export function InviteForm({ token, email, name, inviterName }: Props) {
  const router   = useRouter()
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form     = new FormData(e.currentTarget)
    const fullName = form.get('name')     as string
    const password = form.get('password') as string
    const confirm  = form.get('confirm')  as string

    if (password !== confirm) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const result = await acceptInvite(token, fullName, password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Create session cookie client-side
    const { error: signInError } = await authClient.signIn.email({ email: result.email!, password })
    if (signInError) {
      setError('Account created — please sign in at /login')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 420, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '36px 32px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#1A1206" />
            <rect x="4" y="4" width="19" height="19" fill="#F5A623" />
            <rect x="25" y="4" width="19" height="19" fill="#854F0B" />
            <rect x="4" y="25" width="19" height="19" fill="#854F0B" />
            <rect x="25" y="25" width="19" height="19" fill="#C77A14" />
            <rect x="19" y="19" width="10" height="10" fill="#FEF5E0" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>BackupOS</span>
        </div>

        {/* Invite header */}
        <div style={{
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            You've been invited
          </div>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>
            <strong>{inviterName}</strong> invited you to join BackupOS
          </div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Create your account</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>Set your name and a password to get started.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} readOnly
              style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Your name</label>
            <input
              name="name" type="text" required
              defaultValue={name ?? ''}
              placeholder="Jane Doe"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Password</label>
            <input name="password" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6 }}>Confirm password</label>
            <input name="confirm" type="password" required minLength={8} placeholder="••••••••" style={inputStyle} />
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--err)', marginBottom: 16 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '9px 16px',
              backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 20, textAlign: 'center' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}

// ─── InviteError ──────────────────────────────────────────────────────────
export function InviteError({ reason }: { reason: 'used' | 'expired' | 'invalid' }) {
  const messages: Record<string, string> = {
    used:    'This invite link has already been used.',
    expired: 'This invite link has expired.',
    invalid: 'This invite link is invalid.',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
      <div style={{ width: 380, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Invite unavailable</h1>
        <p style={{ fontSize: 14, color: 'var(--fg-dim)', marginBottom: 24 }}>{messages[reason]}</p>
        <a
          href="/login"
          style={{
            display: 'inline-block', padding: '9px 20px',
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--fg)', textDecoration: 'none',
          }}
        >
          Go to sign in
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modify signup/page.tsx**

Read the current `apps/web/app/(auth)/signup/page.tsx`. Replace its entire content with:

```tsx
// apps/web/app/(auth)/signup/page.tsx
import { redirect }          from 'next/navigation'
import { getDb, user }       from '@backupos/db'
import { SignUpForm }         from './form'
import { InviteForm, InviteError } from './invite-form'
import { getInviteByToken }  from '@/app/actions/invite'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function SignUpPage({ searchParams }: Props) {
  const { token } = await searchParams
  const db = getDb()

  const [existing] = await db.select({ id: user.id }).from(user).limit(1).all()
  const hasUsers   = !!existing

  // First-run: no users in DB yet → show open signup
  if (!hasUsers) {
    return <SignUpForm />
  }

  // No token and users already exist → send to login
  if (!token) {
    redirect('/login')
  }

  // Token present → validate it
  const inv = await getInviteByToken(token)

  if (!inv) {
    return <InviteError reason="invalid" />
  }
  if (!inv.valid) {
    return <InviteError reason={inv.reason as 'used' | 'expired'} />
  }

  return (
    <InviteForm
      token={token}
      email={inv.email}
      name={inv.name}
      inviterName={inv.inviterName}
    />
  )
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Run the build to verify static export is unaffected**

```bash
pnpm --filter @backupos/web build 2>&1 | tail -20
```

Expected: build succeeds, all existing routes still present.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(auth\)/signup/invite-form.tsx apps/web/app/\(auth\)/signup/page.tsx
git commit -m "feat(auth): invite acceptance page with token validation and nice UI"
```

---

## Task 8: Manual smoke test

No automated tests exist for the auth flow in this codebase. Perform these manual checks:

- [ ] **Sign-out works**: click "Sign out" in the profile popover → browser lands on `/login`, cookie is cleared (DevTools → Application → Cookies: `better-auth.session_token` is gone)

- [ ] **Null-session redirect**: clear the session cookie manually in DevTools → navigate to `/dashboard` → should redirect to `/login`

- [ ] **Invite link flow**:
  1. Sign in as admin
  2. Go to `/settings/users` → click "Invite user" → enter an email → click "Create invite link"
  3. Copy the link from the success banner
  4. Open the link in an incognito window → see the styled invite acceptance page with the correct email pre-filled
  5. Set a name and password → click "Create account" → should land on `/dashboard`
  6. Verify the new user appears in `/settings/users`

- [ ] **Expired/used token error**: use the same link again → see "This invite link has already been used" error page

- [ ] **No-token guard**: while signed out, navigate to `/signup` directly (no token) → should redirect to `/login`

- [ ] **First-run signup**: reset the DB (delete `apps/web/data/backupos.db`) → navigate to `/signup` → the original open signup form should appear

- [ ] **Push to origin**

```bash
git push origin main
```
