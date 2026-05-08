import { NextRequest, NextResponse } from 'next/server'
import { getDb, hypervisorIntegrations, eq } from '@backupos/db'
import { getCurrentUser } from '@/lib/user'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  const db = getDb()
  const [integration] = await db
    .select()
    .from(hypervisorIntegrations)
    .where(eq(hypervisorIntegrations.id, id))
    .limit(1)
  if (!integration) return NextResponse.json({ error: 'integration not found' }, { status: 404 })

  const xcpUrl = process.env['BACKUPOS_XCP_URL']
  const internalSecret = process.env['BACKUPOS_INTERNAL_SECRET']
  if (!xcpUrl || !internalSecret) {
    return NextResponse.json({ error: 'BACKUPOS_XCP_URL or BACKUPOS_INTERNAL_SECRET not set' }, { status: 500 })
  }

  let cfg: { host?: string; username?: string; password?: string; cert_fingerprint_sha256?: string }
  try {
    cfg = JSON.parse(integration.config) as typeof cfg
  } catch {
    return NextResponse.json({ error: 'malformed integration config' }, { status: 500 })
  }

  const host = cfg.host ?? ''
  const poolMasterUrl = host.startsWith('http') ? host : `https://${host}`
  const username = cfg.username ?? 'root'
  const password = cfg.password ?? ''
  const certFingerprint = cfg.cert_fingerprint_sha256 ?? ''

  let resp: Response
  try {
    resp = await fetch(`${xcpUrl}/api2/json/sr/list`, {
      method: 'GET',
      headers: {
        'Authorization':                  `Bearer ${internalSecret}`,
        'X-XAPI-Pool-Master-URL':         poolMasterUrl,
        'X-XAPI-Username':                username,
        'X-XAPI-Password':                password,
        'X-XAPI-Cert-Fingerprint-SHA256': certFingerprint,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `failed to reach xcp service: ${String(e)}` }, { status: 502 })
  }

  if (!resp.ok) {
    const text = await resp.text()
    return NextResponse.json({ error: `xcp service ${resp.status}: ${text}` }, { status: 502 })
  }

  const j = await resp.json() as { srs?: unknown[] }
  return NextResponse.json({ srs: j.srs ?? [] })
}
