import { z } from 'zod'

export const HypervisorSchema = z.object({
  name:   z.string().min(1),
  type:   z.enum(['proxmox', 'xcpng', 'vmware']),
  config: z.record(z.unknown()),
})

export const RepositorySchema = z.object({
  name:            z.string().min(1),
  backend:         z.enum(['s3', 'r2', 'b2', 'sftp', 'local', 'rclone']),
  config:          z.record(z.unknown()),
  resticPassword:  z.string().min(1),
})

export const JobSchema = z.object({
  name:         z.string().min(1),
  agentId:      z.string().optional(),
  repositoryId: z.string().min(1),
  sourceType:   z.string().min(1),
  sourceConfig: z.record(z.unknown()).refine(cfg => {
    const paths = cfg['paths']
    if (!Array.isArray(paths)) return true
    return (paths as unknown[]).every(p => typeof p === 'string' && !p.includes('..'))
  }, { message: 'paths must not contain directory traversal sequences' }),
  schedule:     z.string().min(1),
  enabled:      z.boolean().default(true),
  keepLast:     z.number().int().optional(),
  keepDaily:    z.number().int().optional(),
  keepWeekly:   z.number().int().optional(),
  keepMonthly:  z.number().int().optional(),
  keepYearly:   z.number().int().optional(),
  tags:         z.array(z.string()).optional(),
  preHook:      z.record(z.unknown()).optional(),
  postHook:     z.record(z.unknown()).optional(),
})

export const JobUpdateSchema = JobSchema.partial().extend({ id: z.string() })

export const RestoreSpecSchema = z.object({
  id:           z.string().optional(),
  name:         z.string().min(1),
  description:  z.string().optional(),
  yamlContent:  z.string().min(1),
  repositoryId: z.string().optional(),
  jobId:        z.string().optional(),
})

export const MonitorSchema = z.object({
  name:   z.string().min(1),
  type:   z.enum(['proxmox_pbs', 'borg', 'duplicati', 'veeam', 'restic_repo']),
  config: z.record(z.unknown()),
})

export const AlertRuleSchema = z.object({
  id:         z.string().optional(),
  name:       z.string().min(1),
  type:       z.enum(['backup_failed', 'backup_missed', 'repo_check_failed', 'storage_warning', 'agent_disconnected']),
  targetType: z.enum(['job', 'monitor', 'repository', 'agent', 'any']).optional(),
  targetId:   z.string().optional(),
  config:     z.record(z.unknown()),
  enabled:    z.boolean().default(true),
})
