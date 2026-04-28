// RFC 1918 + CGNAT/Tailscale + localhost + mDNS origin trust helper

const PRIVATE_RANGES: Array<{ base: number; mask: number }> = [
  { base: 0x0a000000, mask: 0xff000000 }, // 10.0.0.0/8
  { base: 0xac100000, mask: 0xfff00000 }, // 172.16.0.0/12
  { base: 0xc0a80000, mask: 0xffff0000 }, // 192.168.0.0/16
  { base: 0x64400000, mask: 0xffc00000 }, // 100.64.0.0/10 (CGNAT / Tailscale)
  { base: 0x7f000000, mask: 0xff000000 }, // 127.0.0.0/8
]

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

function isPrivateIp(hostname: string): boolean {
  const n = ipToInt(hostname)
  if (n === null) return false
  return PRIVATE_RANGES.some(r => (n & r.mask) === r.base)
}

export function isPrivateOrigin(origin: string): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }

  const { hostname } = url

  // IPv6 loopback
  if (hostname === '[::1]' || hostname === '::1') return true

  // mDNS
  if (hostname.endsWith('.local')) return true

  return isPrivateIp(hostname)
}
