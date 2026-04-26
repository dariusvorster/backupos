import { readFileSync } from 'node:fs'

export function getSystemUptimeSeconds(): number {
  if (process.platform !== 'linux') return Math.floor(process.uptime())
  try {
    const content = readFileSync('/proc/uptime', 'utf8')
    return Math.floor(parseFloat(content.split(' ')[0]!))
  } catch {
    return Math.floor(process.uptime())
  }
}
