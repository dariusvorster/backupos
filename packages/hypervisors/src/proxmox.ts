import https from 'https'
import type {
  HypervisorBackupResult,
  HypervisorTestResult,
  ProxmoxBackupOptions,
  ProxmoxConfig,
  ProxmoxTarget,
  PveNode,
  PveTaskStatus,
  PveVm,
  VMStatus,
} from './types'

export class ProxmoxHypervisorDriver {
  private readonly agent: https.Agent

  constructor(private readonly config: ProxmoxConfig) {
    this.agent = new https.Agent({
      rejectUnauthorized: config.verifySsl ?? true,
    })
  }

  async test(): Promise<HypervisorTestResult> {
    try {
      await this.get<{ data: PveNode[] }>('/api2/json/nodes')
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Lists all VMs and LXCs across all cluster nodes
  async listTargets(): Promise<ProxmoxTarget[]> {
    const { data: nodes } = await this.get<{ data: PveNode[] }>('/api2/json/nodes')
    const targets: ProxmoxTarget[] = []

    await Promise.all(
      nodes.map(async ({ node }) => {
        const [{ data: vms }, { data: lxcs }] = await Promise.all([
          this.get<{ data: PveVm[] }>(`/api2/json/nodes/${node}/qemu`),
          this.get<{ data: PveVm[] }>(`/api2/json/nodes/${node}/lxc`),
        ])

        for (const vm of vms) {
          targets.push({
            vmid:   vm.vmid,
            name:   vm.name,
            node,
            type:   'qemu',
            status: normaliseStatus(vm.status),
            tags:   vm.tags ? vm.tags.split(';').filter(Boolean) : [],
          })
        }
        for (const lxc of lxcs) {
          targets.push({
            vmid:   lxc.vmid,
            name:   lxc.name,
            node,
            type:   'lxc',
            status: normaliseStatus(lxc.status),
            tags:   lxc.tags ? lxc.tags.split(';').filter(Boolean) : [],
          })
        }
      }),
    )

    return targets
  }

  // Backs up a VM or LXC using vzdump via the Proxmox API
  async backupVM(opts: ProxmoxBackupOptions): Promise<HypervisorBackupResult> {
    const before = Date.now()
    const { node, vmid, type, mode, includeMemory } = opts

    // Step 1: Create a pre-backup snapshot (QEMU only)
    if (type === 'qemu') {
      await this.post(`/api2/json/nodes/${node}/qemu/${vmid}/snapshot`, {
        snapname: `backupos-pre-${Date.now()}`,
        description: 'BackupOS pre-backup snapshot',
      })
    }

    // Step 2: Trigger vzdump
    const { data: upid } = await this.post<{ data: string }>(
      `/api2/json/nodes/${node}/vzdump`,
      {
        vmid:     vmid,
        mode,
        compress: 'zstd',
        remove:   1,
        // BackupOS captures the output via the node's local storage;
        // the agent running on the node will pipe it to Restic
        ...(type === 'qemu' && includeMemory ? { 'save-vmstate': 1 } : {}),
      },
    )

    // Step 3: Poll until the task completes
    await this.waitForTask(node, upid)

    return {
      taskId:   upid,
      duration: Math.round((Date.now() - before) / 1000),
    }
  }

  async getStatus(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<VMStatus> {
    const endpoint = `/api2/json/nodes/${node}/${type}/${vmid}/status/current`
    const { data } = await this.get<{
      data: { vmid: number; status: string; cpu: number; mem: number }
    }>(endpoint)
    return {
      vmid:     data.vmid,
      status:   data.status,
      cpuUsage: data.cpu,
      memUsage: data.mem,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async waitForTask(node: string, upid: string): Promise<void> {
    const encoded = encodeURIComponent(upid)
    for (;;) {
      const { data } = await this.get<{ data: PveTaskStatus }>(
        `/api2/json/nodes/${node}/tasks/${encoded}/status`,
      )
      if (data.status === 'stopped') {
        if (data.exitstatus && data.exitstatus !== 'OK') {
          throw new Error(`Proxmox task ${upid} failed: ${data.exitstatus}`)
        }
        return
      }
      await sleep(2000)
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url    = new URL(path, this.config.url)
      const payload = body ? JSON.stringify(body) : undefined

      const req = https.request(
        {
          hostname: url.hostname,
          port:     url.port || 8006,
          path:     url.pathname + url.search,
          method,
          agent:    this.agent,
          headers: {
            Authorization: `PVEAPIToken=${this.config.tokenId}=${this.config.tokenSecret}`,
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`Proxmox API ${method} ${path} → ${res.statusCode}: ${text}`))
            }
            try {
              resolve(JSON.parse(text) as T)
            } catch {
              reject(new Error(`Proxmox API response is not JSON: ${text}`))
            }
          })
        },
      )

      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  }
}

function normaliseStatus(s: string): 'running' | 'stopped' | 'paused' {
  if (s === 'running') return 'running'
  if (s === 'paused')  return 'paused'
  return 'stopped'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
