'use server'

import { getDb, invite, user } from '@backupos/db'
import { eq, and, isNull }    from 'drizzle-orm'
import { auth }               from '@/lib/auth'
import { getCurrentUser }     from '@/lib/user'
import { sendInviteEmail }    from '@/lib/mailer'

const BASE_URL = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'

// Creates a single-use invite token. Returns the link.
// If SMTP configured, also emails the invite (silently ignores failures).
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

// Deletes a pending (unused) invite.
export async function revokeInvite(id: string): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }

  const db = getDb()
  await db.delete(invite).where(and(eq(invite.id, id), isNull(invite.usedAt)))
  return {}
}

// Public (no auth). Validates token, creates account, marks invite used.
// Returns the email so the client can sign in.
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
    // Roll back so the invite can be retried
    await db.update(invite).set({ usedAt: null }).where(eq(invite.token, token))
    const msg = err instanceof Error ? err.message : 'Could not create account'
    return { error: msg }
  }

  return { email: row.email }
}

// Re-sends the invite email for an existing pending invite (same token, no new row).
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

  const link = `${BASE_URL}/signup?token=${row.token}`
  await sendInviteEmail({ to: row.email, inviterName: currentUser.name, link })
  return {}
}

// Used server-side by the signup page to validate + prefill the invite form.
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
