import https from 'https'

export interface VMRecord {
  uuid: string
  name_label: string
  power_state: string
  resident_on: string
  is_a_template: boolean
  is_control_domain: boolean
  VBDs: string[]
}

export interface PoolRecord {
  uuid: string
  name_label: string
}

function xmlrpcCall(
  url: string,
  methodName: string,
  params: string[],
  verifySsl: boolean,
): Promise<string> {
  // SECURITY NOTE: This function makes HTTPS requests to user-supplied URLs
  // (XCP-ng pool master). Currently safe because:
  //   - Caller is admin-only (gated by requireAdmin())
  //   - BackupOS legitimately needs to reach private/RFC1918 addresses
  //     since hypervisors are typically internal
  //
  // Before Phase 2 expands the surface (scheduled jobs, retry loops, agent
  // callbacks), revisit:
  //   - Should we refuse loopback (127.0.0.0/8, ::1)?
  //   - Should we honor the same SSRF coercion fix as PR #331?
  //   - Should certFingerprint pinning be required for non-localhost?
  //
  // See #185 / #305 / #331 for related SSRF work.
  return new Promise((resolve, reject) => {
    const paramXml = params
      .map(p => `<param><value><string>${escapeXml(p)}</string></value></param>`)
      .join('\n')

    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${escapeXml(methodName)}</methodName>
  <params>
${paramXml}
  </params>
</methodCall>`

    const parsed = new URL(url)
    const agent = new https.Agent({ rejectUnauthorized: verifySsl })

    const req = https.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || 443,
        path:     parsed.pathname || '/RPC2',
        method:   'POST',
        agent,
        headers: {
          'Content-Type':   'text/xml',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`XAPI HTTP ${res.statusCode}: ${text.slice(0, 200)}`))
          }
          resolve(text)
        })
      },
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function checkXapiStatus(xml: string): void {
  // XAPI returns Status=Failure with an ErrorDescription array on errors
  const statusMatch = xml.match(/<name>Status<\/name>\s*<value>\s*<string>([^<]+)<\/string>/)
  if (statusMatch && statusMatch[1] !== 'Success') {
    const errMatch = xml.match(/<name>ErrorDescription<\/name>([\s\S]*?)<\/member>/)
    const desc = errMatch ? errMatch[1].replace(/<[^>]+>/g, ' ').trim() : 'XAPI error'
    throw new Error(`XAPI failure: ${desc}`)
  }
}

/**
 * Login with username/password and return the session reference string.
 */
export async function loginWithPassword(
  url: string,
  user: string,
  pass: string,
  verifySsl: boolean,
): Promise<string> {
  const xml = await xmlrpcCall(url, 'session.login_with_password', [user, pass, '2.0', 'backupos'], verifySsl)
  checkXapiStatus(xml)
  // Extract Value member (session ref)
  const match = xml.match(/<name>Value<\/name>\s*<value>\s*<string>([^<]+)<\/string>/)
  if (!match) throw new Error('XAPI: could not parse session ref from login response')
  return match[1]
}

/**
 * Log out the session.
 */
export async function logout(url: string, session: string): Promise<void> {
  try {
    await xmlrpcCall(url, 'session.logout', [session], true)
  } catch {
    // best-effort
  }
}

/**
 * Returns all VM records keyed by opaque ref.
 */
export async function vmGetAllRecords(
  url: string,
  session: string,
  verifySsl: boolean,
): Promise<Record<string, VMRecord>> {
  const xml = await xmlrpcCall(url, 'VM.get_all_records', [session], verifySsl)
  checkXapiStatus(xml)
  return parseStructOfStructs(xml) as Record<string, VMRecord>
}

/**
 * Returns all Pool records keyed by opaque ref.
 */
export async function poolGetAllRecords(
  url: string,
  session: string,
  verifySsl: boolean,
): Promise<Record<string, PoolRecord>> {
  const xml = await xmlrpcCall(url, 'pool.get_all_records', [session], verifySsl)
  checkXapiStatus(xml)
  return parseStructOfStructs(xml) as Record<string, PoolRecord>
}

// ── Simple XML struct parser ──────────────────────────────────────────────────
// XAPI returns a struct of structs inside <value><struct>...</struct></value>.
// We extract the Value member and parse it with a lightweight regex approach.

function parseStructOfStructs(xml: string): Record<string, Record<string, unknown>> {
  // Find the <value> block after the <name>Value</name>
  const valueBlockMatch = xml.match(/<name>Value<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/)
  if (!valueBlockMatch) return {}

  const outer = valueBlockMatch[1]
  const result: Record<string, Record<string, unknown>> = {}

  // Each top-level member is a keyed record (opaque ref to struct)
  const memberRe = /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g
  let m: RegExpExecArray | null
  while ((m = memberRe.exec(outer)) !== null) {
    const ref = m[1]
    const inner = m[2]
    result[ref] = parseStruct(inner)
  }

  return result
}

function parseStruct(xml: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  const memberRe = /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g
  let m: RegExpExecArray | null
  while ((m = memberRe.exec(xml)) !== null) {
    const key = m[1]
    const valXml = m[2].trim()
    obj[key] = parseValue(valXml)
  }
  return obj
}

function parseValue(xml: string): unknown {
  const strMatch = xml.match(/^<string>([\s\S]*?)<\/string>$/)
  if (strMatch) return strMatch[1]

  const boolMatch = xml.match(/^<boolean>([01])<\/boolean>$/)
  if (boolMatch) return boolMatch[1] === '1'

  const intMatch = xml.match(/^<int>([\s\S]*?)<\/int>$/)
  if (intMatch) return parseInt(intMatch[1], 10)

  if (xml.includes('<array>')) {
    const arrayItems: unknown[] = []
    const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/)
    if (dataMatch) {
      const itemRe = /<value>([\s\S]*?)<\/value>/g
      let m: RegExpExecArray | null
      while ((m = itemRe.exec(dataMatch[1])) !== null) {
        arrayItems.push(parseValue(m[1].trim()))
      }
    }
    return arrayItems
  }

  if (xml.includes('<struct>')) {
    return parseStruct(xml)
  }

  // Plain text node (bare string without tags)
  return xml.replace(/<[^>]+>/g, '').trim()
}
