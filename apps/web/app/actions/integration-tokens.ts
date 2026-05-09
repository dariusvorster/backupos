'use server'

import { revalidatePath } from 'next/cache'
import { getDb, integrationTokens, eq, count } from '@backupos/db'
import { requireAdmin } from '@/lib/user'
import { enforceLimit, LicenseLimitError } from '@/lib/license'
import { appendAuditEntry } from '@/lib/audit'
import { generateRawToken, hashToken, extractPrefix, ALL_SCOPES } from '@/lib/integration-tokens'

export async function createIntegrationToken(formData: FormData): Promise<{ token?: string; id?: string; error?: string }> {
  const adminUser     = await requireAdmin()
  const name          = (formData.get('name') as string | null)?.trim()
  const expiresInDays = parseInt((formData.get('expiresInDays') as string | null) ?? '90', 10)
  const scopesRaw     = formData.getAll('scopes') as string[]

  if (!name) return { error: 'Name is required' }
  if (scopesRaw.length === 0) return { error: 'At least one scope is required' }

  const db = getDb()
  const tkRows = await db.select({ tkCount: count(integrationTokens.id) }).from(integrationTokens).all()
  const tkCount = tkRows[0]?.tkCount ?? 0
  try { await enforceLimit('apiTokens', tkCount) } catch (e) {
    if (e instanceof LicenseLimitError) return { error: e.message }
    throw e
  }

  const validScopes = scopesRaw.filter(s => (ALL_SCOPES as string[]).includes(s))
  if (validScopes.length !== scopesRaw.length) return { error: 'Invalid scope detected' }

  const rawToken    = generateRawToken()
  const tokenHash   = hashToken(rawToken)
  const tokenPrefix = extractPrefix(rawToken)
  const expiresAt   = expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const id = crypto.randomUUID()

  await db.insert(integrationTokens).values({
    id,
    name,
    tokenHash,
    tokenPrefix,
    scopes:       JSON.stringify(validScopes),
    expiresAt:    expiresAt ?? undefined,
    createdAt:    new Date(),
    createdBy:    adminUser.id,
    lastUsedAt:   undefined,
    revokedAt:    undefined,
    rateLimitRpm: 60,
  })

  appendAuditEntry({
    action:       'integration_token.created',
    resourceType: 'integration_token',
    resourceId:   id,
    actor:        adminUser.email,
    detail:       { name, scopes: validScopes, expiresAt: expiresAt?.toISOString() ?? null },
  })

  revalidatePath('/settings/api-tokens')
  return { token: rawToken, id }
}

export async function revokeIntegrationToken(id: string): Promise<{ error?: string }> {
  const adminUser = await requireAdmin()
  const db = getDb()

  const [existing] = await db.select().from(integrationTokens).where(eq(integrationTokens.id, id)).limit(1)
  if (!existing) return { error: 'Token not found' }
  if (existing.revokedAt) return { error: 'Token already revoked' }

  await db.update(integrationTokens).set({ revokedAt: new Date() }).where(eq(integrationTokens.id, id))

  appendAuditEntry({
    action:       'integration_token.revoked',
    resourceType: 'integration_token',
    resourceId:   id,
    actor:        adminUser.email,
    detail:       { name: existing.name },
  })

  revalidatePath('/settings/api-tokens')
  return {}
}

export async function rotateIntegrationToken(id: string): Promise<{ token?: string; newId?: string; error?: string }> {
  const adminUser = await requireAdmin()
  const db = getDb()

  const [existing] = await db.select().from(integrationTokens).where(eq(integrationTokens.id, id)).limit(1)
  if (!existing) return { error: 'Token not found' }
  if (existing.revokedAt) return { error: 'Cannot rotate a revoked token — create a new one instead' }

  const rawToken    = generateRawToken()
  const tokenHash   = hashToken(rawToken)
  const tokenPrefix = extractPrefix(rawToken)
  const newId       = crypto.randomUUID()

  // Mark old token revoked (keeps it valid during 24h grace period for the API middleware)
  await db.update(integrationTokens).set({ revokedAt: new Date() }).where(eq(integrationTokens.id, id))

  await db.insert(integrationTokens).values({
    id:           newId,
    name:         existing.name + ' (rotated)',
    tokenHash,
    tokenPrefix,
    scopes:       existing.scopes,
    expiresAt:    existing.expiresAt ?? undefined,
    createdAt:    new Date(),
    createdBy:    adminUser.id,
    lastUsedAt:   undefined,
    revokedAt:    undefined,
    rateLimitRpm: existing.rateLimitRpm,
  })

  appendAuditEntry({
    action:       'integration_token.rotated',
    resourceType: 'integration_token',
    resourceId:   id,
    actor:        adminUser.email,
    detail:       { newId, name: existing.name },
  })

  revalidatePath('/settings/api-tokens')
  return { token: rawToken, newId }
}
