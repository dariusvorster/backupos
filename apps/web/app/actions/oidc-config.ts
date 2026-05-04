'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/user'
import { upsertOidcConfig, disableOidc as disableOidcDb } from '@/lib/oidc-config'
import { appendAuditEntry } from '@/lib/audit'

export async function saveOidcConfig(input: {
  enabled:       boolean
  providerLabel: string
  discoveryUrl:  string
  clientId:      string
  clientSecret?: string
  scopes:        string
  buttonLabel:   string
}): Promise<{ error?: string }> {
  const admin = await requireAdmin()

  if (!input.discoveryUrl?.trim()) return { error: 'Discovery URL is required' }
  if (!input.clientId?.trim())     return { error: 'Client ID is required' }

  try { new URL(input.discoveryUrl) } catch { return { error: 'Discovery URL is not a valid URL' } }

  try {
    upsertOidcConfig(input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save config' }
  }

  appendAuditEntry({
    action:       'settings.updated',
    resourceType: 'oidc_config',
    resourceId:   'singleton',
    actor:        admin.id,
    detail:       { enabled: input.enabled, providerLabel: input.providerLabel },
  })

  revalidatePath('/settings/auth/sso')
  return {}
}

export async function disableOidc(): Promise<{ error?: string }> {
  const admin = await requireAdmin()
  try {
    disableOidcDb()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to disable' }
  }

  appendAuditEntry({
    action:       'settings.updated',
    resourceType: 'oidc_config',
    resourceId:   'singleton',
    actor:        admin.id,
    detail:       { enabled: false, action: 'disable' },
  })

  revalidatePath('/settings/auth/sso')
  return {}
}

export async function testOidcDiscovery(discoveryUrl: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()
  if (!discoveryUrl.trim()) return { ok: false, message: 'No URL provided' }

  let parsed: URL
  try { parsed = new URL(discoveryUrl) } catch { return { ok: false, message: 'Invalid URL' } }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: 'Only http:// and https:// URLs are allowed' }
  }

  const { assertSafeUrl, SSRFViolation } = await import('@/lib/ssrf-guard')
  try {
    await assertSafeUrl(discoveryUrl)
  } catch (err) {
    if (err instanceof SSRFViolation) {
      return { ok: false, message: 'URL points to a private/loopback address — not allowed' }
    }
    throw err
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(discoveryUrl, { method: 'GET', signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, message: `Discovery returned HTTP ${res.status}` }

    const data = await res.json() as Record<string, unknown>
    const required = ['authorization_endpoint', 'token_endpoint', 'issuer']
    const missing  = required.filter(k => !data[k])
    if (missing.length > 0) {
      return { ok: false, message: `Missing fields in discovery document: ${missing.join(', ')}` }
    }
    return { ok: true, message: `Discovered issuer: ${data['issuer']}` }
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('abort')) return { ok: false, message: 'Discovery timed out after 5s' }
    return { ok: false, message: msg }
  }
}
