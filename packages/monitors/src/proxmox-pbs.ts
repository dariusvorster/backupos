import https from 'https'
import type {
  BackupMonitorAdapter,
  MonitorConfig,
  MonitorSyncResult,
  PBSConfig,
  PBSDatastore,
  PBSSnapshot,
  PBSTask,
} from './types'

export class ProxmoxPBSMonitor implements BackupMonitorAdapter {
  readonly type = 'proxmox_pbs'
  readonly displayName = 'Proxmox Backup Server'

  async test(config: MonitorConfig): Promise<{ ok: boolean; message?: string }> {
    const cfg = config as PBSConfig
    try {
      await this.get<unknown>(cfg, '/api2/json/status/datastore-usage')
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(config: MonitorConfig): Promise<MonitorSyncResult> {
    const cfg = config as PBSConfig

    // Datastore usage
    const { data: datastores } = await this.get<{ data: PBSDatastore[] }>(
      cfg,
      '/api2/json/status/datastore-usage',
    )
    const ds = datastores.find((d) => d.store === cfg.datastore) ?? datastores[0]

    // Snapshots in the configured datastore
    const { data: snapshots } = await this.get<{ data: PBSSnapshot[] }>(
      cfg,
      `/api2/json/admin/datastore/${cfg.datastore}/snapshots`,
    ).catch(() => ({ data: [] as PBSSnapshot[] }))

    // Recent tasks to determine last backup status
    const { data: tasks } = await this.get<{ data: PBSTask[] }>(
      cfg,
      '/api2/json/nodes/localhost/tasks?limit=20&typefilter=backup',
    ).catch(() => ({ data: [] as PBSTask[] }))

    const lastTask    = tasks.find((t) => t.type === 'backup')
    const lastSuccess = tasks.find((t) => t.type === 'backup' && t.status === 'OK')

    const lastBackupAt = lastTask
      ? new Date(lastTask.starttime * 1000)
      : undefined

    const hasError = tasks.some(
      (t) => t.type === 'backup' && t.status && t.status !== 'OK',
    )

    return {
      status:           hasError ? 'warning' : 'healthy',
      lastBackupAt,
      lastBackupStatus: lastSuccess ? 'success' : (lastTask ? 'failed' : 'unknown'),
      sizeBytes:        ds?.used,
      jobCount:         snapshots.length,
      details: {
        datastore:       cfg.datastore,
        datastoreTotal:  ds?.total,
        datastoreUsed:   ds?.used,
        datastoreAvail:  ds?.avail,
        snapshotCount:   snapshots.length,
      },
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private get<T>(cfg: PBSConfig, path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url   = new URL(path, cfg.url)
      const agent = new https.Agent({ rejectUnauthorized: cfg.verifySsl ?? true })

      const req = https.request(
        {
          hostname: url.hostname,
          port:     url.port || 8007,
          path:     url.pathname + url.search,
          method:   'GET',
          agent,
          headers: {
            Authorization: `PBSAPIToken=${cfg.tokenId}=${cfg.tokenSecret}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`PBS API GET ${path} → ${res.statusCode}: ${text}`))
            }
            try {
              resolve(JSON.parse(text) as T)
            } catch {
              reject(new Error(`PBS API response is not JSON: ${text}`))
            }
          })
        },
      )

      req.on('error', reject)
      req.end()
    })
  }
}
