import { load } from 'js-yaml'
import { z } from 'zod'
import type { ParsedRestoreSpec, RestoreStep } from './types'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const onFailure = z.enum(['abort', 'continue', 'notify_only'])

const filesystemRestoreStep = z.object({
  name:          z.string(),
  type:          z.literal('filesystem_restore'),
  snapshot_path: z.string(),
  target_path:   z.string(),
  on_failure:    onFailure.default('abort'),
})

const databaseRestoreStep = z.object({
  name:          z.string(),
  type:          z.literal('database_restore'),
  app:           z.enum(['postgres', 'mysql', 'mariadb', 'sqlite', 'redis', 'mongodb']),
  snapshot_path: z.string(),
  target:        z.object({
    container: z.string().optional(),
    database:  z.string().optional(),
    username:  z.string().optional(),
    path:      z.string().optional(),
  }),
  on_failure: onFailure.default('abort'),
})

const shellStep = z.object({
  name:        z.string(),
  type:        z.literal('shell'),
  command:     z.string(),
  working_dir: z.string().optional(),
  on_failure:  onFailure.default('abort'),
})

const httpCheckStep = z.object({
  name:            z.string(),
  type:            z.literal('http_check'),
  url:             z.string().url(),
  expected_status: z.number().int().default(200),
  timeout_seconds: z.number().int().default(30),
  retry_count:     z.number().int().default(3),
  on_failure:      onFailure.default('notify_only'),
})

const containerRestartStep = z.object({
  name:       z.string(),
  type:       z.literal('container_restart'),
  container:  z.string(),
  on_failure: onFailure.default('abort'),
})

const notifyStep = z.object({
  name:       z.string(),
  type:       z.literal('notify'),
  channel:    z.string(),
  message:    z.string().optional(),
  on_failure: onFailure.default('continue'),
})

const restoreStepSchema = z.discriminatedUnion('type', [
  filesystemRestoreStep,
  databaseRestoreStep,
  shellStep,
  httpCheckStep,
  containerRestartStep,
  notifyStep,
])

const notificationConfig = z.object({
  channel: z.enum(['email', 'webhook', 'slack']),
  to:      z.string().optional(),
  url:     z.string().optional(),
})

const restoreSpecSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  version:     z.string().default('1.0'),
  repository:  z.string().min(1),
  snapshot:    z.string().optional(),
  steps:       z.array(restoreStepSchema).min(1),
  notifications: z.object({
    on_success: z.array(notificationConfig).optional(),
    on_failure: z.array(notificationConfig).optional(),
  }).optional(),
})

// ── Parser ────────────────────────────────────────────────────────────────────

export class RestoreSpecParseError extends Error {
  constructor(
    message: string,
    public readonly issues?: z.ZodIssue[],
  ) {
    super(message)
    this.name = 'RestoreSpecParseError'
  }
}

function toStep(raw: z.infer<typeof restoreStepSchema>): RestoreStep {
  switch (raw.type) {
    case 'filesystem_restore':
      return {
        name:         raw.name,
        type:         'filesystem_restore',
        snapshotPath: raw.snapshot_path,
        targetPath:   raw.target_path,
        onFailure:    raw.on_failure,
      }
    case 'database_restore':
      return {
        name:         raw.name,
        type:         'database_restore',
        app:          raw.app,
        snapshotPath: raw.snapshot_path,
        target:       raw.target,
        onFailure:    raw.on_failure,
      }
    case 'shell':
      return {
        name:       raw.name,
        type:       'shell',
        command:    raw.command,
        workingDir: raw.working_dir,
        onFailure:  raw.on_failure,
      }
    case 'http_check':
      return {
        name:           raw.name,
        type:           'http_check',
        url:            raw.url,
        expectedStatus: raw.expected_status,
        timeoutSeconds: raw.timeout_seconds,
        retryCount:     raw.retry_count,
        onFailure:      raw.on_failure,
      }
    case 'container_restart':
      return {
        name:      raw.name,
        type:      'container_restart',
        container: raw.container,
        onFailure: raw.on_failure,
      }
    case 'notify':
      return {
        name:      raw.name,
        type:      'notify',
        channel:   raw.channel,
        message:   raw.message,
        onFailure: raw.on_failure,
      }
  }
}

export function parseRestoreSpec(yaml: string): ParsedRestoreSpec {
  let raw: unknown
  try {
    raw = load(yaml)
  } catch (err) {
    throw new RestoreSpecParseError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const result = restoreSpecSchema.safeParse(raw)
  if (!result.success) {
    throw new RestoreSpecParseError(
      `Invalid restore spec: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      result.error.issues,
    )
  }

  const d = result.data
  return {
    name:        d.name,
    description: d.description,
    version:     d.version,
    repository:  d.repository,
    snapshot:    d.snapshot,
    steps:       d.steps.map(toStep),
    notifications: d.notifications
      ? {
          onSuccess: d.notifications.on_success?.map(n => ({
            channel: n.channel,
            to:      n.to,
            url:     n.url,
          })),
          onFailure: d.notifications.on_failure?.map(n => ({
            channel: n.channel,
            to:      n.to,
            url:     n.url,
          })),
        }
      : undefined,
  }
}
