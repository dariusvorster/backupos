import * as https from 'node:https'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_xcp_backup' }>
type EnsureRepoFn = (engine: ResticEngine, repoId: string) => Promise<void>

interface ActiveJobRef {
  ctrl: AbortController
  runId: string
  phase: string
  lastResticEventAt: number
  cancelled: boolean
}

async function xcpRequest(opts: {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  xcpBase: string
  bearerToken: string
  pool: RunMsg['pool']
  body?: object
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.xcpBase + opts.path)
    // GET: pool creds in headers. POST/DELETE: pool creds in body.
    const poolHeaders: Record<string, string> = opts.method === 'GET' ? {
      'X-XAPI-Pool-Master-URL':         opts.pool.masterUrl,
      'X-XAPI-Username':                opts.pool.username,
      'X-XAPI-Password':                opts.pool.password,
      'X-XAPI-Cert-Fingerprint-SHA256': opts.pool.certFingerprintSha256,
    } : {}
    const bodyStr = opts.body ? JSON.stringify(opts.body) : ''
    const req = https.request({
      hostname:           url.hostname,
      port:               url.port ? parseInt(url.port) : 443,
      path:               url.pathname + url.search,
      method:             opts.method,
      rejectUnauthorized: false, // self-signed cert; bearer token provides auth. TODO: proper pinning
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${opts.bearerToken}`,
        ...poolHeaders,
        // Explicit Content-Length prevents Node from dropping the body on DELETE
        ...(bodyStr ? { 'Content-Length': String(Buffer.byteLength(bodyStr)) } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

export async function runXcpngBackup(
  msg: RunMsg,
  send: SendFn,
  activeJobs: Map<string, ActiveJobRef>,
  binaryPath: string | undefined,
  ensureRepo: EnsureRepoFn,
): Promise<void> {
  const { jobId, pool, xcp, target, repoId, repoUrl, repoPassword, envVars, bandwidthLimitKbps } = msg
  const ctrl      = new AbortController()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  activeJobs.set(jobId, { ctrl, runId: msg.runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const setPhase = (phase: string) => {
    const j = activeJobs.get(jobId)
    if (j) { j.phase = phase; j.lastResticEventAt = Date.now() }
  }

  const engine = new ResticEngine({
    repositoryUrl:      repoUrl,
    password:           repoPassword,
    envVars:            envVars ?? {},
    binaryPath,
    bandwidthLimitKbps: bandwidthLimitKbps ?? undefined,
  })

  const xcpBase = xcp.serviceUrl.replace(/\/$/, '')

  const snapshotIds: string[] = []
  const agg = { filesNew: 0, filesChanged: 0, filesUnmodified: 0, dataAdded: 0, totalSize: 0, durationMs: 0 }
  const logLines: string[] = []
  const log = (line: string) => logLines.push(`[${new Date().toISOString()}] ${line}`)

  try {
    await ensureRepo(engine, repoId)

    for (const disk of target.disks) {
      if (ctrl.signal.aborted) throw new Error('cancelled')
      log(`disk ${disk.vdiName} (${disk.vdiUUID}, ${disk.virtualSize} bytes, position ${disk.userDevice})`)

      // 1. Take snapshot
      setPhase(`snapshot:${disk.userDevice}`)
      const snapResp = await xcpRequest({
        method: 'POST', path: '/api2/json/snapshot',
        xcpBase, bearerToken: xcp.bearerToken, pool,
        body: {
          pool_master_url:         pool.masterUrl,
          username:                pool.username,
          password:                pool.password,
          cert_fingerprint_sha256: pool.certFingerprintSha256,
          source_uuid:             disk.vdiUUID,
          name_label:              `backupos-${jobId.slice(0, 8)}-${disk.userDevice}-${timestamp}`,
        },
      })
      if (snapResp.status !== 200) throw new Error(`snapshot failed (${snapResp.status}): ${snapResp.body}`)
      const snap = JSON.parse(snapResp.body) as { uuid: string; name_label: string; cbt_enabled: boolean }
      log(`snapshot taken: ${snap.uuid} (cbt_enabled=${snap.cbt_enabled})`)

      try {
        // 2. Open stream
        setPhase(`stream:${disk.userDevice}`)
        const streamUrl = new URL(`${xcpBase}/api2/json/snapshot/${snap.uuid}/stream`)
        const streamRes = await new Promise<import('http').IncomingMessage>((resolve, reject) => {
          const req = https.request({
            hostname:           streamUrl.hostname,
            port:               streamUrl.port ? parseInt(streamUrl.port) : 443,
            path:               streamUrl.pathname,
            method:             'GET',
            rejectUnauthorized: false,
            headers: {
              'Authorization':                  `Bearer ${xcp.bearerToken}`,
              'X-XAPI-Pool-Master-URL':         pool.masterUrl,
              'X-XAPI-Username':                pool.username,
              'X-XAPI-Password':                pool.password,
              'X-XAPI-Cert-Fingerprint-SHA256': pool.certFingerprintSha256,
            },
          })
          req.once('response', resolve)
          req.once('error', reject)
          req.end()
        })
        if (streamRes.statusCode !== 200) {
          let errBody = ''
          streamRes.setEncoding('utf8')
          for await (const chunk of streamRes) errBody += chunk as string
          throw new Error(`stream failed (${streamRes.statusCode}): ${errBody}`)
        }

        // 3. Pipe to restic
        setPhase(`restic:${disk.userDevice}`)
        const result = await engine.backupFromStream({
          stream:        streamRes,
          stdinFilename: `${target.vmName}-${disk.userDevice}.img`,
          tags: [
            `xcp:pool=${target.poolUUID}`,
            `xcp:host=${target.hostFqdn}`,
            `xcp:vm=${target.vmUUID}`,
            `xcp:vdi=${disk.vdiUUID}`,
            `xcp:snapshot=${snap.uuid}`,
            `xcp:user_device=${disk.userDevice}`,
            `xcp:virtual_size=${disk.virtualSize}`,
            `xcp:job=${jobId}`,
          ],
          signal: ctrl.signal,
        })
        snapshotIds.push(result.snapshotId)
        agg.filesNew        += result.filesNew
        agg.filesChanged    += result.filesChanged
        agg.filesUnmodified += result.filesUnmodified
        agg.dataAdded       += result.dataAdded
        agg.totalSize       += result.totalSize
        agg.durationMs      += result.duration
        log(`disk ${disk.userDevice} done: restic snapshot ${result.snapshotId}, +${result.dataAdded} bytes`)

      } finally {
        // 4. Always destroy snapshot — don't fail the run on destroy failure
        setPhase(`destroy:${disk.userDevice}`)
        const destResp = await xcpRequest({
          method: 'DELETE', path: `/api2/json/snapshot/${snap.uuid}?mode=destroy`,
          xcpBase, bearerToken: xcp.bearerToken, pool,
          body: {
            pool_master_url:         pool.masterUrl,
            username:                pool.username,
            password:                pool.password,
            cert_fingerprint_sha256: pool.certFingerprintSha256,
          },
        }).catch((e: unknown) => ({ status: 0, body: String(e) }))
        if (destResp.status !== 200) {
          log(`WARN: snapshot destroy failed (${destResp.status}): ${destResp.body}`)
        }
      }
    }

    send({
      type:       'backup_complete',
      jobId,
      snapshotId: snapshotIds[0] ?? '',
      snapshotIds,
      stats: {
        filesNew:            agg.filesNew,
        filesChanged:        agg.filesChanged,
        filesUnmodified:     agg.filesUnmodified,
        dataAdded:           agg.dataAdded,
        totalFilesProcessed: agg.filesNew + agg.filesChanged + agg.filesUnmodified,
        totalBytesProcessed: agg.totalSize,
        durationMs:          agg.durationMs,
      },
      log: logLines.join('\n').slice(0, 1_000_000) || undefined,
    })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`FAIL: ${errMsg}`)
    send({
      type:   'backup_failed',
      jobId,
      error:  errMsg,
      detail: err instanceof Error && err.stack ? err.stack : '',
      log:    logLines.join('\n').slice(0, 1_000_000) || undefined,
    })
  } finally {
    activeJobs.delete(jobId)
  }
}
