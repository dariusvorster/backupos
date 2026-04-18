import { cpus, totalmem, freemem, release } from 'node:os'
import { spawnSync } from 'node:child_process'
import type { AgentMetrics } from '@backupos/agent-protocol'

function getCpuTimes(): [number, number] {
  let idle = 0, total = 0
  for (const cpu of cpus()) {
    idle += cpu.times.idle
    for (const v of Object.values(cpu.times)) total += v
  }
  return [idle, total]
}

async function getCpuPercent(): Promise<number> {
  const [idle1, total1] = getCpuTimes()
  await new Promise(r => setTimeout(r, 200))
  const [idle2, total2] = getCpuTimes()
  const totalDiff = total2 - total1
  if (totalDiff === 0) return 0
  return Math.round((1 - (idle2 - idle1) / totalDiff) * 100)
}

interface PSDrive { Name: string; Used: number | null; Free: number | null }

function getDiskInfo(): { usedBytes: Record<string, number>; totalBytes: Record<string, number> } {
  const usedBytes:  Record<string, number> = {}
  const totalBytes: Record<string, number> = {}
  try {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
       'Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json'],
      { encoding: 'utf-8' },
    )
    const drives = JSON.parse(result.stdout ?? '[]') as PSDrive | PSDrive[]
    const list = Array.isArray(drives) ? drives : [drives]
    for (const d of list) {
      if (d.Used == null || d.Free == null) continue
      const mount   = `${d.Name}:`
      const used    = d.Used
      const total   = d.Used + d.Free
      usedBytes[mount]  = used
      totalBytes[mount] = total
    }
  } catch { /* ignore */ }
  return { usedBytes, totalBytes }
}

export async function collectMetrics(): Promise<AgentMetrics> {
  const cpuPercent = await getCpuPercent()
  const total = totalmem()
  const free  = freemem()
  const disk  = getDiskInfo()
  return {
    cpuPercent,
    memUsedBytes:  total - free,
    memTotalBytes: total,
    diskUsedBytes:  disk.usedBytes,
    diskTotalBytes: disk.totalBytes,
    uptimeSeconds: 0, // Windows uptime via GetTickCount64 not easily accessible from JS
  }
}

export { release }
