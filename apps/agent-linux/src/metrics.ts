import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { AgentMetrics } from '@backupos/agent-protocol'

function readCpuTimes(): [number, number] {
  const stat = readFileSync('/proc/stat', 'utf-8')
  const line = (stat.split('\n')[0] ?? '').replace(/^cpu\s+/, '')
  const nums = line.split(' ').map(Number)
  const idle = (nums[3] ?? 0) + (nums[4] ?? 0)
  const total = nums.reduce((a, b) => a + b, 0)
  return [idle, total]
}

async function getCpuPercent(): Promise<number> {
  const [idle1, total1] = readCpuTimes()
  await new Promise(r => setTimeout(r, 200))
  const [idle2, total2] = readCpuTimes()
  const totalDiff = total2 - total1
  if (totalDiff === 0) return 0
  return Math.round((1 - (idle2 - idle1) / totalDiff) * 100)
}

function getMemInfo(): { usedBytes: number; totalBytes: number } {
  const mem = readFileSync('/proc/meminfo', 'utf-8')
  const parse = (key: string): number => {
    const m = mem.match(new RegExp(`${key}:\\s+(\\d+)`))
    return m ? parseInt(m[1] ?? '0', 10) * 1024 : 0
  }
  const total = parse('MemTotal')
  const free = parse('MemFree')
  const buffers = parse('Buffers')
  const cached = parse('Cached')
  return { totalBytes: total, usedBytes: total - free - buffers - cached }
}

function getDiskInfo(): { usedBytes: Record<string, number>; totalBytes: Record<string, number> } {
  const usedBytes: Record<string, number> = {}
  const totalBytes: Record<string, number> = {}
  try {
    const result = spawnSync('df', ['-B1', '--output=target,size,used'], { encoding: 'utf-8' })
    const out = result.stdout ?? ''
    for (const line of out.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 3) continue
      const [mount, size, used] = parts
      if (!mount || !size || !used || !mount.startsWith('/')) continue
      totalBytes[mount] = parseInt(size, 10)
      usedBytes[mount] = parseInt(used, 10)
    }
  } catch { /* ignore on non-Linux */ }
  return { usedBytes, totalBytes }
}

function getUptimeSeconds(): number {
  try {
    return parseFloat((readFileSync('/proc/uptime', 'utf-8').split(' ')[0]) ?? '0')
  } catch {
    return 0
  }
}

export async function collectMetrics(): Promise<AgentMetrics> {
  const [cpuPercent, mem, disk] = await Promise.all([
    getCpuPercent(),
    Promise.resolve(getMemInfo()),
    Promise.resolve(getDiskInfo()),
  ])
  return {
    cpuPercent,
    memUsedBytes: mem.usedBytes,
    memTotalBytes: mem.totalBytes,
    diskUsedBytes: disk.usedBytes,
    diskTotalBytes: disk.totalBytes,
    uptimeSeconds: getUptimeSeconds(),
  }
}
