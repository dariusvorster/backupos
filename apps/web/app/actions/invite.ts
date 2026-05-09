'use server'

import { revalidatePath }           from 'next/cache'
import { randomBytes }              from 'crypto'
import { getDb, invite, user }      from '@backupos/db'
import { eq, and, isNull, count }   from '@backupos/db'
import { auth }                     from '@/lib/auth'
import { getCurrentUser, requireAdmin } from '@/lib/user'
import { enforceLimit, LicenseLimitError } from '@/lib/license'
import { sendInviteEmail }          from '@/lib/mailer'
import { appendAuditEntry }         from '@/lib/audit'

const BASE_URL = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'

// Creates a single-use invite token. Returns the link.
// If SMTP configured, also emails the invite (silently ignores failures).
export async function createInvite(
  formData: FormData,
): Promise<{ id?: string; link?: string; error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }
  if (currentUser.role !== 'admin') return { error: 'Admin role required to invite users' }

  const email = (formData.get('email') as string | null)?.trim()
  const name  = (formData.get('name')  as string | null)?.trim() || null
  const rawRole = (formData.get('role') as string | null)?.trim()
  const role  = rawRole === 'admin' ? 'admin' : 'viewer'

  if (!email) return { error: 'Email is required' }

  const db    = getDb()
  const [{ userCount }] = await db.select({ userCount: count(user.id) }).from(user).all()
  try { await enforceLimit('operators', userCount) } catch (e) {
    if (e instanceof LicenseLimitError) return { error: e.message }
    throw e
  }
  const id    = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now   = Date.now()

  await db.insert(invite).values({
    id,
    email,
    name,
    token,
    role,
    createdBy: currentUser.id,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    usedAt:    null,
    createdAt: now,
  })

  const link = `${BASE_URL}/signup?token=${token}`

  await sendInviteEmail({ to: email, inviterName: currentUser.name, link }).catch(() => {})

  return { id, link }
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
    .select({ email: invite.email, name: invite.name, token: invite.token, role: invite.role, usedAt: invite.usedAt, expiresAt: invite.expiresAt })
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

  // Apply the role stored on the invite (defaults to 'viewer')
  const inviteRole = row.role ?? 'viewer'
  if (inviteRole !== 'admin') {
    await db.update(user).set({ role: inviteRole }).where(eq(user.email, row.email))
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

// Creates a user account directly (no invite flow). Admin-only.
// If no password provided, one is auto-generated and returned once.
export async function createUserDirect(formData: FormData): Promise<{
  id?: string; name?: string; email?: string; createdAt?: number
  tempPassword?: string; error?: string
}> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not authenticated' }
  if (currentUser.role !== 'admin') return { error: 'Admin role required to create users' }

  const name    = (formData.get('name')     as string | null)?.trim() || ''
  const email   = (formData.get('email')    as string | null)?.trim() || ''
  const rawPw   = (formData.get('password') as string | null)?.trim() || null
  const rawRole = (formData.get('role')     as string | null)?.trim()
  const role    = rawRole === 'admin' ? 'admin' : 'viewer'

  if (!name)  return { error: 'Name is required' }
  if (!email) return { error: 'Email is required' }

  const password     = rawPw ?? randomBytes(12).toString('base64url')
  const isAutoGenPw  = rawPw === null

  try {
    await auth.api.signUpEmail({ body: { email, name, password } })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create account' }
  }

  const db  = getDb()
  const now = new Date()

  await db.update(user).set({ emailVerified: true, role, updatedAt: now }).where(eq(user.email, email))

  const [created] = await db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user).where(eq(user.email, email)).limit(1).all()

  if (!created) return { error: 'User created but could not be retrieved' }

  appendAuditEntry({
    action:       'user.created',
    resourceType: 'user',
    resourceId:   created.id,
    resourceName: created.email,
    actor:        currentUser.email,
    detail:       { createdBy: currentUser.id, direct: true },
  })

  revalidatePath('/settings/users')
  return {
    id:          created.id,
    name:        created.name,
    email:       created.email,
    createdAt:   created.createdAt?.getTime() ?? Date.now(),
    tempPassword: isAutoGenPw ? password : undefined,
  }
}

export async function updateUserRole(userId: string, role: 'admin' | 'viewer'): Promise<{ error?: string }> {
  const admin = await requireAdmin()
  if (userId === admin.id) return { error: 'Cannot change your own role' }
  if (role !== 'admin' && role !== 'viewer') return { error: 'Invalid role' }

  const db = getDb()
  await db.update(user).set({ role }).where(eq(user.id, userId))

  appendAuditEntry({
    action:       'user.role_changed',
    resourceType: 'user',
    resourceId:   userId,
    actor:        admin.email,
    detail:       { newRole: role, changedBy: admin.id },
  })

  revalidatePath('/settings/users')
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
