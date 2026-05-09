export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }                                                from 'next/server'
import { getDb, backupJobs, repositories, restoreRuns, hypervisorTargets, hypervisorIntegrations, eq } from '@backupos/db'
import { decryptField }                                                             from '@/lib/repo-crypto'
import { connectedAgentIds, dispatch }                                              from '@/lib/ws-state'
import { checkInternalAuth }                                                       from '@/lib/internal-auth'

export async function POST(req: NextRequest) {
  const deny = checkInternalAuth(req)
  if (deny) return deny

  let body: { job_id?: string; target_sr_uuid?: string; vm_name?: string; target_template_name_label?: string }
  try { body = await req.json() as typeof body }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }

  if (!body.job_id)        return NextResponse.json({ error: 'job_id required' },        { status: 400 })
  if (!body.target_sr_uuid) return NextResponse.json({ error: 'target_sr_uuid required' }, { status: 400 })

  const xcpServiceUrl  = process.env['BACKUPOS_XCP_URL']
  const internalSecret = process.env['BACKUPOS_INTERNAL_SECRET']
  if (!xcpServiceUrl || !internalSecret) {
    return NextResponse.json({ error: 'BACKUPOS_XCP_URL or BACKUPOS_INTERNAL_SECRET not set' }, { status: 503 })
  }

  const db    = getDb()
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, body.job_id)).limit(1)
  if (!job) return NextResponse.json({ error: `job ${body.job_id} not found` }, { status: 404 })
  if (job.sourceType !== 'xcpng_vm') {
    return NextResponse.json({ error: 'job is not xcpng_vm type' }, { status: 422 })
  }

  const srcConfig = JSON.parse(job.sourceConfig) as { targetId?: string }
  const [target]  = await db.select().from(hypervisorTargets).where(eq(hypervisorTargets.id, srcConfig.targetId ?? '')).limit(1)
  if (!target) return NextResponse.json({ error: 'hypervisor target not found' }, { status: 422 })

  const [integration] = await db.select().from(hypervisorIntegrations).where(eq(hypervisorIntegrations.id, target.integrationId ?? '')).limit(1)
  if (!integration) return NextResponse.json({ error: 'hypervisor integration not found' }, { status: 422 })

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId ?? '')).limit(1)
  if (!repo) return NextResponse.json({ error: 'repository not found' }, { status: 422 })

  const integrationConfig = JSON.parse(decryptField(integration.config)) as Record<string, string>
  const repoCfg           = JSON.parse(decryptField(repo.config))        as Record<string, string>
  const repoPassword      = decryptField(repo.resticPassword)

  const poolMasterUrl = (integrationConfig['host'] ?? '').startsWith('http')
    ? (integrationConfig['host'] ?? '')
    : `https://${integrationConfig['host'] ?? ''}${integrationConfig['port'] ? `:${integrationConfig['port']}` : ''}`

  const tagsData = JSON.parse(target.tags ?? '{}') as {
    disks?: Array<{ uuid: string; virtual_size: number; user_device: string; bootable: boolean }>
  }

  const builtInAgentId = connectedAgentIds().find(id => id.startsWith('00000000-0000-0000-0000-'))
  if (!builtInAgentId) return NextResponse.json({ error: 'XCP-ng built-in agent is not connected' }, { status: 503 })

  const restoreRunId = crypto.randomUUID()

  await db.insert(restoreRuns).values({
    id:        restoreRunId,
    status:    'running',
    trigger:   'api',
    startedAt: new Date(),
  })

  const sent = dispatch(builtInAgentId, {
    type:    'run_xcpng_vm_restore',
    jobId:   job.id,
    runId:   restoreRunId,
    pool: {
      masterUrl:             poolMasterUrl,
      username:              integrationConfig['username'] ?? '',
      password:              integrationConfig['password'] ?? '',
      certFingerprintSha256: integrationConfig['cert_fingerprint_sha256'] ?? '',
    },
    xcp: { serviceUrl: xcpServiceUrl, bearerToken: internalSecret },
    vmUUID:                  target.externalId,
    vmName:                  body.vm_name ?? `${target.name}-restored`,
    targetSrUUID:            body.target_sr_uuid,
    targetTemplateNameLabel: body.target_template_name_label ?? 'Other install media',
    repoId:                  job.repositoryId ?? '',
    repoUrl:                 repoCfg['repositoryUrl'] ?? '',
    repoPassword,
    envVars:  repoCfg,
    disks: (tagsData.disks ?? []).map(d => ({
      originalVdiUUID: d.uuid,
      virtualSize:     d.virtual_size,
      userDevice:      d.user_device,
      bootable:        d.bootable,
    })),
  })

  if (!sent) {
    await db.update(restoreRuns).set({ status: 'failed', completedAt: new Date() }).where(eq(restoreRuns.id, restoreRunId))
    return NextResponse.json({ error: 'built-in agent disconnected before dispatch' }, { status: 503 })
  }

  return NextResponse.json({ restore_run_id: restoreRunId }, { status: 201 })
}
