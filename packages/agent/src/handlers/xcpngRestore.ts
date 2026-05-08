import * as https from 'node:https'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_xcpng_vm_restore' }>
type EnsureRepoFn = (engine: ResticEngine, repoId: string) => Promise<void>

interface DiskInfo {
  snapshotId:  string
  vdiUUID:     string
  userDevice:  string
  virtualSize: number
  bootable:    boolean
  time:        string
}

function parseTagValue(tags: string[], prefix: string): string {
  const t = tags.find(t => t.startsWith(prefix))
  return t ? t.slice(prefix.length) : ''
}

function groupByVdi(snapshots: Array<{ id: string; tags?: string[]; time: string }>): DiskInfo[] {
  const byVdi = new Map<string, DiskInfo>()
  for (const snap of snapshots) {
    const tags    = snap.tags ?? []
    const vdiUUID   = parseTagValue(tags, 'xcp:vdi=')
    const userDevice = parseTagValue(tags, 'xcp:user_device=')
    if (!vdiUUID || !userDevice) continue
    const sizeStr   = parseTagValue(tags, 'xcp:virtual_size=')
    const virtualSize = sizeStr ? parseInt(sizeStr, 10) : 0
    const existing  = byVdi.get(vdiUUID)
    if (!existing || snap.time > existing.time) {
      byVdi.set(vdiUUID, {
        snapshotId: snap.id,
        vdiUUID,
        userDevice,
        virtualSize,
        bootable:    userDevice === '0' || userDevice === 'xvda',
        time:        snap.time,
      })
    }
  }
  return Array.from(byVdi.values()).sort((a, b) => a.userDevice.localeCompare(b.userDevice))
}

function findImgFile(dir: string): string | null {
  const search = (d: string): string | null => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return null }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        const found = search(full)
        if (found) return found
      } else if (e.name.endsWith('.img')) {
        return full
      }
    }
    return null
  }
  return search(dir)
}

async function xcpPost(opts: {
  path:        string
  xcpBase:     string
  bearerToken: string
  pool:        RunMsg['pool']
  body:        object
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.xcpBase + opts.path)
    const payload = JSON.stringify(opts.body)
    const req = https.request({
      hostname:           url.hostname,
      port:               url.port ? parseInt(url.port) : 443,
      path:               url.pathname + url.search,
      method:             'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization':  `Bearer ${opts.bearerToken}`,
        'X-XAPI-Pool-Master-URL':         opts.pool.masterUrl,
        'X-XAPI-Username':                opts.pool.username,
        'X-XAPI-Password':                opts.pool.password,
        'X-XAPI-Cert-Fingerprint-SHA256': opts.pool.certFingerprintSha256,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

async function uploadVdi(opts: {
  imgPath:     string
  vdiUUID:     string
  xcpBase:     string
  bearerToken: string
  pool:        RunMsg['pool']
  signal:      AbortSignal
}): Promise<void> {
  const { size } = fs.statSync(opts.imgPath)
  const url = new URL(`${opts.xcpBase}/api2/json/vdi/${opts.vdiUUID}/upload`)

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname:           url.hostname,
      port:               url.port ? parseInt(url.port) : 443,
      path:               url.pathname,
      method:             'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type':                   'application/octet-stream',
        'Content-Length':                 size,
        'Authorization':                  `Bearer ${opts.bearerToken}`,
        'X-XAPI-Pool-Master-URL':         opts.pool.masterUrl,
        'X-XAPI-Username':                opts.pool.username,
        'X-XAPI-Password':                opts.pool.password,
        'X-XAPI-Cert-Fingerprint-SHA256': opts.pool.certFingerprintSha256,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        if (res.statusCode === 200) resolve()
        else reject(new Error(`vdi upload returned ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8')}`))
      })
    })
    req.on('error', reject)
    opts.signal.addEventListener('abort', () => req.destroy(new Error('cancelled')))
    const stream = fs.createReadStream(opts.imgPath)
    stream.on('error', reject)
    stream.pipe(req)
  })
}

export async function runXcpngVmRestore(
  msg: RunMsg,
  send: SendFn,
  binaryPath: string | undefined,
  ensureRepo: EnsureRepoFn,
): Promise<void> {
  const { jobId, pool, xcp, vmUUID, vmName, targetSrUUID, repoId, repoUrl, repoPassword, envVars } = msg
  const ctrl    = new AbortController()
  const xcpBase = xcp.serviceUrl.replace(/\/$/, '')
  const logLines: string[] = []
  const log = (line: string) => logLines.push(`[${new Date().toISOString()}] ${line}`)

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })

    await ensureRepo(engine, repoId)

    const allSnaps = await engine.snapshots([`xcp:vm=${vmUUID}`])
    const disks    = groupByVdi(allSnaps)

    if (disks.length === 0) {
      throw new Error(`no restic snapshots found for VM ${vmUUID} — has a successful backup run completed?`)
    }

    send({ type: 'xcpng_vm_restore_started', jobId, runId: msg.runId, diskCount: disks.length })
    log(`found ${disks.length} disk snapshot(s) for VM ${vmUUID}`)

    // Apply disk info from message if available (provides accurate virtual_size)
    if (msg.disks && msg.disks.length > 0) {
      for (const d of disks) {
        const hint = msg.disks.find(x => x.originalVdiUUID === d.vdiUUID || x.userDevice === d.userDevice)
        if (hint) {
          d.virtualSize = hint.virtualSize
          d.bootable    = hint.bootable
        }
      }
    }

    const newVdiMap = new Map<string, string>() // userDevice → new VDI UUID

    for (const disk of disks) {
      if (ctrl.signal.aborted) throw new Error('cancelled')

      log(`restoring disk ${disk.userDevice} (original VDI ${disk.vdiUUID}, snapshot ${disk.snapshotId})`)

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backupos-xcprestore-'))
      try {
        await engine.restore(disk.snapshotId, tempDir, undefined, ctrl.signal)

        const imgPath = findImgFile(tempDir)
        if (!imgPath) throw new Error(`no .img file found in restore dir for disk ${disk.userDevice}`)

        const fileSize   = fs.statSync(imgPath).size
        const virtualSize = disk.virtualSize > 0 ? disk.virtualSize : fileSize
        log(`restored image: ${imgPath} (${fileSize} bytes, virtual size ${virtualSize} bytes)`)

        // Create new VDI on target SR
        const createResp = await xcpPost({
          path:        '/api2/json/vdi/create',
          xcpBase, bearerToken: xcp.bearerToken, pool,
          body: {
            pool_master_url:         pool.masterUrl,
            username:                pool.username,
            password:                pool.password,
            cert_fingerprint_sha256: pool.certFingerprintSha256,
            sr_uuid:      targetSrUUID,
            name_label:   `backupos-restore-${vmName}-${disk.userDevice}`,
            virtual_size: virtualSize,
          },
        })
        if (createResp.status !== 200) {
          throw new Error(`vdi.create failed (${createResp.status}): ${createResp.body}`)
        }
        const newVdiUUID = (JSON.parse(createResp.body) as { uuid: string }).uuid
        log(`created VDI ${newVdiUUID} on SR ${targetSrUUID}`)

        // Upload image data to new VDI
        await uploadVdi({ imgPath, vdiUUID: newVdiUUID, xcpBase, bearerToken: xcp.bearerToken, pool, signal: ctrl.signal })
        log(`uploaded ${fileSize} bytes to VDI ${newVdiUUID}`)

        newVdiMap.set(disk.userDevice, newVdiUUID)
      } finally {
        try { fs.rmSync(tempDir, { recursive: true }) } catch { /* best-effort cleanup */ }
      }
    }

    // Clone VM from template
    const vmResp = await xcpPost({
      path:        '/api2/json/vm/clone-from-template',
      xcpBase, bearerToken: xcp.bearerToken, pool,
      body: {
        pool_master_url:         pool.masterUrl,
        username:                pool.username,
        password:                pool.password,
        cert_fingerprint_sha256: pool.certFingerprintSha256,
        template_name_label: msg.targetTemplateNameLabel ?? 'Other install media',
        new_name_label:      vmName,
        memory_bytes:        msg.memoryBytes ?? 0,
        vcpus:               msg.vcpus ?? 0,
      },
    })
    if (vmResp.status !== 200) throw new Error(`vm.clone-from-template failed (${vmResp.status}): ${vmResp.body}`)
    const newVmUUID = (JSON.parse(vmResp.body) as { uuid: string }).uuid
    log(`cloned VM ${newVmUUID} from template "${msg.targetTemplateNameLabel ?? 'Other install media'}"`)


    // Attach VBDs
    for (const disk of disks) {
      const newVdiUUID = newVdiMap.get(disk.userDevice)
      if (!newVdiUUID) continue
      const vbdResp = await xcpPost({
        path:        '/api2/json/vbd/create',
        xcpBase, bearerToken: xcp.bearerToken, pool,
        body: {
          pool_master_url:         pool.masterUrl,
          username:                pool.username,
          password:                pool.password,
          cert_fingerprint_sha256: pool.certFingerprintSha256,
          vm_uuid:    newVmUUID,
          vdi_uuid:   newVdiUUID,
          userdevice: disk.userDevice,
          bootable:   disk.bootable,
        },
      })
      if (vbdResp.status !== 200) {
        log(`WARN: vbd.create for ${disk.userDevice} failed (${vbdResp.status}): ${vbdResp.body}`)
      } else {
        log(`attached VDI ${newVdiUUID} to VM ${newVmUUID} as device ${disk.userDevice}`)
      }
    }

    // Recreate VIFs from snapshot tags
    const vifPrefix = 'xcp:vif='
    const refSnap    = allSnaps.find(s => disks[0] && s.id === disks[0].snapshotId)
    const vifTags    = (refSnap?.tags ?? []).filter(t => t.startsWith(vifPrefix))
    log(`found ${vifTags.length} VIF tag(s) to restore`)
    for (const tag of vifTags) {
      const rest   = tag.slice(vifPrefix.length)
      const eqIdx  = rest.indexOf('=')
      if (eqIdx < 0) continue
      const jsonStr = rest.slice(eqIdx + 1)
      let vifInfo: { device: string; network_label: string; mac: string; mtu: number; locking_mode: string }
      try { vifInfo = JSON.parse(jsonStr) } catch { log(`WARN: could not parse VIF tag JSON: ${jsonStr}`); continue }
      try {
        const vifResp = await xcpPost({
          path: '/api2/json/vif/create',
          xcpBase, bearerToken: xcp.bearerToken, pool,
          body: {
            pool_master_url:         pool.masterUrl,
            username:                pool.username,
            password:                pool.password,
            cert_fingerprint_sha256: pool.certFingerprintSha256,
            vm_uuid:                 newVmUUID,
            device:                  vifInfo.device,
            network_label:           vifInfo.network_label,
            mac:                     vifInfo.mac,
            mtu:                     vifInfo.mtu,
            locking_mode:            vifInfo.locking_mode,
          },
        })
        if (vifResp.status !== 200) {
          log(`WARN: vif/create for device=${vifInfo.device} failed (${vifResp.status}): ${vifResp.body}`)
        } else {
          const result = JSON.parse(vifResp.body) as { uuid: string; mac_used: string }
          if (result.mac_used !== vifInfo.mac) {
            log(`VIF created with new MAC ${result.mac_used} (original ${vifInfo.mac} was in use) device=${vifInfo.device}`)
          } else {
            log(`VIF created: device=${vifInfo.device} mac=${vifInfo.mac} network="${vifInfo.network_label}"`)
          }
        }
      } catch (vifErr) {
        log(`WARN: vif/create threw: ${vifErr instanceof Error ? vifErr.message : String(vifErr)}`)
      }
    }

    send({
      type:      'xcpng_vm_restore_complete',
      jobId,
      runId:     msg.runId,
      success:   true,
      newVmUUID,
      log:       logLines.join('\n').slice(0, 1_000_000) || undefined,
    })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`FAIL: ${errMsg}`)
    send({
      type:    'xcpng_vm_restore_complete',
      jobId,
      runId:   msg.runId,
      success: false,
      error:   errMsg,
      log:     logLines.join('\n').slice(0, 1_000_000) || undefined,
    })
  }
}
