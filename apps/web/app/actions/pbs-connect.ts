'use server'

import { request as httpsRequest, Agent } from 'node:https'
import { getDb, pbsTokens, pbsDatastores, eq } from '@backupos/db'
import { requireAdminAction } from '@/lib/user'
import { getPbsServerInfo } from '@/lib/pbs-server'

export interface TestConnectionResult {
  ok:                  boolean
  latencyMs?:          number
  serverVersion?:      string
  datastoreReachable?: boolean
  error?:              string
}

export async function testPbsConnection(input: {
  tokenId:       string
  datastoreName: string
}): Promise<TestConnectionResult> {
  await requireAdminAction()
  const db = getDb()

  const [tokenRow] = await db
    .select()
    .from(pbsTokens)
    .where(eq(pbsTokens.id, input.tokenId))
    .limit(1)
  if (!tokenRow) return { ok: false, error: 'Token not found' }

  const [dsRow] = await db
    .select()
    .from(pbsDatastores)
    .where(eq(pbsDatastores.name, input.datastoreName))
    .limit(1)
  if (!dsRow) return { ok: false, error: 'Datastore not found' }

  let server: Awaited<ReturnType<typeof getPbsServerInfo>>
  try {
    server = await getPbsServerInfo()
  } catch (e) {
    return { ok: false, error: `Could not read PBS server info: ${(e as Error).message}` }
  }

  const start = Date.now()

  // Step 1: version probe (no auth)
  const versionResult = await pbsHttpsGet({
    host:        'localhost',
    port:        server.port,
    path:        '/api2/json/version',
    fingerprint: server.fingerprint,
  })
  if (!versionResult.ok) {
    return { ok: false, error: `Version probe failed: ${versionResult.error}` }
  }
  let serverVersion = 'unknown'
  try {
    serverVersion = JSON.parse(versionResult.body ?? '{}')?.data?.version ?? 'unknown'
  } catch { /* ignore */ }

  // Step 2: self-test datastore probe (hash-based auth, localhost-only endpoint)
  // The Authorization header sends the stored hash as the "secret". The
  // dedicated /self-test endpoint accepts this only from localhost with the
  // X-BackupOS-Self-Test header, so the hash never leaves the server.
  const authHeader = `PBSAPIToken=${tokenRow.user}@${tokenRow.realm}!${tokenRow.tokenName}:${tokenRow.secretHash}`
  const dsResult = await pbsHttpsGet({
    host:        'localhost',
    port:        server.port,
    path:        `/api2/json/admin/self-test/datastore/${encodeURIComponent(dsRow.name)}`,
    fingerprint: server.fingerprint,
    headers: {
      Authorization:         authHeader,
      'X-BackupOS-Self-Test': '1',
    },
  })

  const latencyMs = Date.now() - start

  if (!dsResult.ok) {
    return { ok: false, error: `Datastore probe failed: ${dsResult.error}`, serverVersion, latencyMs }
  }

  return { ok: true, latencyMs, serverVersion, datastoreReachable: true }
}

interface HttpsGetOpts {
  host:        string
  port:        number
  path:        string
  fingerprint: string
  headers?:    Record<string, string>
}
interface HttpsGetResult { ok: boolean; body?: string; error?: string }

function pbsHttpsGet(opts: HttpsGetOpts): Promise<HttpsGetResult> {
  return new Promise((resolve) => {
    const agent = new Agent({ rejectUnauthorized: false })
    const req = httpsRequest(
      {
        host:    opts.host,
        port:    opts.port,
        path:    opts.path,
        method:  'GET',
        agent,
        headers: opts.headers,
        timeout: 5000,
      },
      (res) => {
        // Manual fingerprint check — the security boundary
        const peerCert = (res.socket as NodeJS.Socket & {
          getPeerCertificate?: () => { fingerprint256?: string }
        }).getPeerCertificate?.()
        if (peerCert?.fingerprint256 && peerCert.fingerprint256 !== opts.fingerprint) {
          resolve({
            ok:    false,
            error: `Fingerprint mismatch (got ${peerCert.fingerprint256}, expected ${opts.fingerprint})`,
          })
          req.destroy()
          return
        }
        let body = ''
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, body })
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` })
          }
        })
      },
    )
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout after 5s' }) })
    req.on('error', (e: Error) => resolve({ ok: false, error: e.message }))
    req.end()
  })
}
