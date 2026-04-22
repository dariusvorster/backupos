# Real Auth & User Invites — Design Spec

## Goal

Wire up end-to-end authentication (fix sign-out, null-session redirect) and add an admin-driven invite system so additional users can join a self-hosted BackupOS installation via a single-use link, with optional email delivery.

## Architecture

`better-auth` is already fully configured (`lib/auth.ts`), the API route handler is live (`/api/auth/[...all]`), and all tRPC procedures use `authedProcedure`. The remaining work is: three auth fixups, a new `invite` DB table + migration, a tRPC `invite` router, a `lib/mailer.ts` SMTP module, a `/settings/users` page, and a redesigned invitation-acceptance variant of `/signup`.

## Tech Stack

- better-auth (email+password, existing)
- Drizzle ORM + SQLite (`@backupos/db`)
- tRPC (`authedProcedure` for all invite mutations)
- nodemailer (optional SMTP, skipped silently if unconfigured)
- Next.js App Router (server actions + client components)

---

## Section 1 — Data Layer

### `invite` table (new)

| column | type | constraints |
|--------|------|-------------|
| `id` | text | PK, UUID |
| `email` | text | NOT NULL |
| `name` | text | nullable |
| `token` | text | UNIQUE, NOT NULL (UUID used in the link) |
| `created_by` | text | FK → `user.id` ON DELETE CASCADE |
| `expires_at` | integer | NOT NULL (unix ms, default now + 7 days) |
| `used_at` | integer | nullable — null means pending |
| `created_at` | integer | NOT NULL |

A Drizzle migration is generated and committed. `migrate()` is called at app startup so the table is created on first boot.

---

## Section 2 — API & Server Logic

### tRPC `invite` router (`packages/api/src/router/invite.ts`)

All three procedures require `authedProcedure`.

**`invite.create({ email, name? })`**
- Validates email format
- Generates a UUID token
- Inserts invite row with `expiresAt = now + 7 days`
- Returns `{ id, token, link }` where `link = BASE_URL + /signup?token=<token>`
- If `SMTP_HOST` env var is set, calls `mailer.sendInvite({ to: email, inviterName, link })`
- SMTP failure is logged but does not fail the procedure

**`invite.list()`**
- Returns all invites ordered by `createdAt DESC`
- Includes `pending` boolean: `usedAt IS NULL AND expiresAt > now`

**`invite.revoke({ id })`**
- Deletes the row only if `usedAt IS NULL`
- Throws `NOT_FOUND` if already used or doesn't exist

### Public server action `acceptInvite` (`apps/web/app/actions/invite.ts`)

Not behind `authedProcedure` — called by the unauthenticated invite acceptance page.

1. Look up invite by token — throw if missing, expired (`expiresAt < now`), or already used
2. Call `auth.api.signUpEmail({ email, name, password })` — throws if email already registered
3. Set `used_at = now` on the invite row
4. Return `{ ok: true }` — client calls `authClient.signIn.email` to create the session cookie

### `lib/mailer.ts`

```ts
// Reads SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM from env.
// Returns undefined (no-op) if SMTP_HOST is absent.
export async function sendInviteEmail(opts: {
  to: string
  inviterName: string
  link: string
}): Promise<void>
```

Uses `nodemailer`. Email is plain HTML: BackupOS logo, headline "You've been invited", inviter name, CTA button linking to `opts.link`, 7-day expiry note.

---

## Section 3 — Pages & UI

### `/settings/users` (new page)

**File:** `apps/web/app/(dashboard)/settings/users/page.tsx`

Server component. Loads current users and pending invites via tRPC server-side caller.

Layout:
- Page header: "Users" with "Invite user" button top-right
- **Existing users table**: avatar, name, email, joined date. Read-only for now (no delete — out of scope).
- **Pending invites section** (only shown if any exist): email, name, sent date, expires date. Each row has:
  - Copy-link icon button (copies the invite URL to clipboard)
  - "Resend email" button (visible only if SMTP configured — calls `invite.create` with same email, revokes old)
  - "Revoke" button (calls `invite.revoke`)
- **Invite form** (inline, slide-down on "Invite user" click):
  - Email field (required)
  - Name field (optional)
  - "Send invite" button → calls `invite.create` → row appears in pending list, link shown in a dismissible success banner

### `/signup?token=xxx` — Invitation acceptance page

**File:** `apps/web/app/(auth)/signup/page.tsx` (modified) + `apps/web/app/(auth)/signup/invite-form.tsx` (new)

`page.tsx` logic:
- If no users in DB → render `<SignUpForm />` (first-run, unchanged)
- If `token` param present → validate token server-side → if valid render `<InviteForm token email name inviterName />`, if invalid/expired render `<InviteError />`
- If users exist and no token → `redirect('/login')`

`<InviteForm>` design:
```
┌─────────────────────────────────────┐
│  [BackupOS logo]  BackupOS           │
│                                      │
│  You've been invited                 │
│  [inviterName] invited you to join   │
│  BackupOS                            │
│                                      │
│  Email  [pre-filled, read-only]      │
│  Name   [pre-filled if set, editable]│
│  Password [••••••••]                 │
│  Confirm  [••••••••]                 │
│                                      │
│  [Create account]                    │
└─────────────────────────────────────┘
```

Card style matches the existing login page (same CSS vars, same card dimensions).

`<InviteError>` shows: lock icon, "This invite is invalid or has expired", link back to `/login`.

### Auth fixups (existing files)

**Profile popover** (`apps/web/components/profile-popover.tsx`):
- Remove `<form action="/api/auth/sign-out" method="POST">`
- Replace with a client-side button that calls `await authClient.signOut()` then `router.push('/login')`

**Dashboard layout** (`apps/web/app/(dashboard)/layout.tsx`):
- After `const currentUser = await getCurrentUser()`, add `if (!currentUser) redirect('/login')`
- Remove the `'Admin'` / `'admin@backupos.local'` fallback — `sidebarUser` is always the real user

---

## Error Handling

- Expired token: clear error page, no stack trace, link to `/login`
- Used token: same error page ("This invite has already been used")
- SMTP failure: logged to stderr, invite still created, UI shows link for manual sharing
- Password mismatch: client-side validation before submit
- Email already registered: surface the error message from better-auth

## Testing

- Unit: `acceptInvite` — valid token creates user + marks used; expired token throws; used token throws
- Unit: `invite.revoke` — used invite is rejected
- Integration: full signup flow via invite link (token → account created → session cookie set)
- Manual: sign-out button clears cookie and lands on `/login`; dashboard without session redirects to `/login`

---

## Out of Scope

- Role/permission system (all invited users are regular users; admin distinction is not modelled)
- User deletion from the UI
- Invite email rate limiting
- Password reset flow
