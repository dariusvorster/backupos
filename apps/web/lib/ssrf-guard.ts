// SSRF defense — refuse outbound HTTP fetches to private/loopback/link-local destinations.
// Used by alert delivery and monitor probes where users provide URLs.
//
// Threat model: a hostile admin could create a webhook alert pointing at
// http://127.0.0.1/internal-api/ or http://169.254.169.254/ (cloud metadata)
// to probe or exfiltrate from internal services.
//
// Refused ranges:
//   - RFC 1918 private ranges (10/8, 172.16/12, 192.168/16)
//   - CGNAT (100.64/10) — covers Tailscale
//   - Loopback (127/8, ::1)
//   - Link-local IPv4 (169.254/16) — blocks AWS/GCP metadata
//   - Link-local IPv6 (fe80::/10)
//   - Multicast / unspecified
//   - IPv6 ULA (fc00::/7)

import { lookup } from 'dns/promises'
import { isPrivateOrigin } from './private-origin'

export class SSRFViolation extends Error {
  constructor(url: string, reason: string) {
    super(`Refusing outbound request to ${url}: ${reason}`)
    this.name = 'SSRFViolation'
  }
}

const LINK_LOCAL_V4_BASE = 0xa9fe0000  // 169.254.0.0
const LINK_LOCAL_V4_MASK = 0xffff0000  // /16

function ipToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const byte = parseInt(p, 10)
    if (isNaN(byte) || byte < 0 || byte > 255) return null
    n = (n << 8) | byte
  }
  return n >>> 0
}

function isLinkLocalV4(ip: string): boolean {
  const n = ipToInt(ip)
  if (n === null) return false
  return (n & LINK_LOCAL_V4_MASK) === LINK_LOCAL_V4_BASE
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true  // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true         // ULA fc00::/7
  if (lower.startsWith('ff')) return true                                   // multicast
  return false
}

function isLikelyIPLiteral(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')
}

export async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFViolation(url, 'invalid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFViolation(url, `protocol ${parsed.protocol} not allowed`)
  }

  // Strip brackets from raw IPv6 hosts: "[::1]" -> "::1"
  const host = parsed.hostname.replace(/^\[|\]$/g, '')

  // Fast path: RFC 1918 + CGNAT + loopback + localhost + .local (via isPrivateOrigin)
  if (isPrivateOrigin(parsed.origin)) {
    throw new SSRFViolation(url, 'host resolves to a private/loopback range')
  }

  // Link-local v4 (169.254/16) — not covered by isPrivateOrigin
  if (isLinkLocalV4(host)) {
    throw new SSRFViolation(url, 'link-local address (169.254/16) blocked')
  }

  // IPv6 checks
  if (host.includes(':') && isBlockedIPv6(host)) {
    throw new SSRFViolation(url, 'private/loopback/link-local IPv6 blocked')
  }

  // DNS resolution: catch hostnames that resolve to private IPs (DNS rebinding, internal A records)
  if (!isLikelyIPLiteral(host)) {
    let resolved
    try {
      resolved = await lookup(host, { all: true })
    } catch {
      // DNS failure → let fetch fail naturally; not an SSRF concern
      return
    }
    for (const r of resolved) {
      if (r.family === 4) {
        if (isPrivateOrigin(`http://${r.address}`)) {
          throw new SSRFViolation(url, `host resolves to private IPv4 ${r.address}`)
        }
        if (isLinkLocalV4(r.address)) {
          throw new SSRFViolation(url, `host resolves to link-local IPv4 ${r.address}`)
        }
      } else if (r.family === 6) {
        if (isBlockedIPv6(r.address)) {
          throw new SSRFViolation(url, `host resolves to blocked IPv6 ${r.address}`)
        }
      }
    }
  }
}
