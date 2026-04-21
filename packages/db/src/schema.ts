import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ── Agents ────────────────────────────────────────────────────────────────
// An agent is the backupos-agent binary running on a source host

export const agents = sqliteTable('agents', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  hostname:     text('hostname'),
  ip:           text('ip'),
  osInfo:       text('os_info'),             // JSON: { os, arch, kernel }
  platform:     text('platform'),            // 'linux' | 'windows' | 'nas'
  arch:         text('arch'),               // 'x64' | 'arm64'
  vssAvailable: integer('vss_available', { mode: 'boolean' }),
  agentVersion: text('agent_version'),
  status:       text('status').default('disconnected'),
  lastSeenAt:   integer('last_seen_at',   { mode: 'timestamp' }),
  enrolledAt:   integer('enrolled_at',    { mode: 'timestamp' }).notNull(),
  publicKey:    text('public_key').notNull(), // Ed25519
  updateChannel:     text('update_channel').default('stable'),   // 'stable' | 'beta' | 'pinned'
  hypervisorDriver:  integer('hypervisor_driver',  { mode: 'boolean' }),
  appHooksAvailable: integer('app_hooks_available', { mode: 'boolean' }),
  cpuPct:            integer('cpu_pct'),
  ramBytes:          integer('ram_bytes'),
  diskReadBps:       integer('disk_read_bps'),
  diskWriteBps:      integer('disk_write_bps'),
  resourceHistory:   text('resource_history'),
})

// ── Repositories ──────────────────────────────────────────────────────────
// A Restic repository — where backups are stored

export const repositories = sqliteTable('repositories', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  backend:         text('backend').notNull(),   // 's3'|'r2'|'b2'|'sftp'|'local'|'rclone'
  config:          text('config').notNull(),    // JSON, encrypted — backend-specific details
  resticPassword:  text('restic_password').notNull(), // encrypted with ENCRYPTION_KEY
  sizeBytes:       integer('size_bytes'),
  snapshotCount:   integer('snapshot_count'),
  lastCheckedAt:   integer('last_checked_at',   { mode: 'timestamp' }),
  lastCheckStatus: text('last_check_status'),   // 'ok' | 'errors' | 'unknown'
  createdAt:          integer('created_at',           { mode: 'timestamp' }).notNull(),
  costPerGbMonth:     integer('cost_per_gb_month'),
  monthlyBudgetCents: integer('monthly_budget_cents'),
  escrowedKey:        text('escrowed_key'),
  group:              text('group'),
  rawSizeBytes:       integer('raw_size_bytes'),
  replicas:           text('replicas'),
})

// ── Infra OS service registry ─────────────────────────────────────────────
// Manually registered (or API-synced) services for coverage tracking

export const infraOsServices = sqliteTable('infra_os_services', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  serviceType: text('service_type').notNull(), // 'database' | 'filesystem' | 'container'
  host:        text('host'),
  description: text('description'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Backup jobs ───────────────────────────────────────────────────────────
// A scheduled backup job — what to back up, where, and when

export const backupJobs = sqliteTable('backup_jobs', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  agentId:      text('agent_id').references(() => agents.id),
  repositoryId: text('repository_id').references(() => repositories.id),

  // What to back up
  sourceType:   text('source_type').notNull(),
  // 'filesystem'|'docker_volume'|'docker_container'|'podman_container'
  // |'database'|'files'|'proxmox_vm'|'proxmox_lxc'|'xcpng_vm'
  // |'vmware_vm'|'windows_system'|'nas_share'
  sourceConfig: text('source_config').notNull(), // JSON — source-specific config

  // Schedule
  schedule: text('schedule').notNull(), // cron expression
  enabled:  integer('enabled', { mode: 'boolean' }).default(true),

  // Retention
  keepLast:    integer('keep_last'),
  keepDaily:   integer('keep_daily'),
  keepWeekly:  integer('keep_weekly'),
  keepMonthly: integer('keep_monthly'),
  keepYearly:  integer('keep_yearly'),

  // Tags
  tags: text('tags'), // JSON array — restic tags

  // Hooks
  preHook:  text('pre_hook'),  // JSON — AppHookConfig
  postHook: text('post_hook'), // JSON — AppHookConfig

  lastRunAt:     integer('last_run_at',     { mode: 'timestamp' }),
  lastRunStatus: text('last_run_status'),   // 'success' | 'failed' | 'running'
  nextRunAt:     integer('next_run_at',     { mode: 'timestamp' }),
  createdAt:     integer('created_at',      { mode: 'timestamp' }).notNull(),
  bandwidthProfileId: text('bandwidth_profile_id').references(() => bandwidthProfiles.id),

  // Pre-flight checks
  preflightEnabled:    integer('preflight_enabled',    { mode: 'boolean' }).default(true),
  lastPreflightAt:     integer('last_preflight_at',    { mode: 'timestamp' }),
  lastPreflightStatus: text('last_preflight_status'),  // 'ok' | 'warning' | 'failed' | null
  infraServiceId: text('infra_service_id').references(() => infraOsServices.id),
})

// ── Backup runs ───────────────────────────────────────────────────────────
// Each execution of a backup job

export const backupRuns = sqliteTable('backup_runs', {
  id:           text('id').primaryKey(),
  jobId:        text('job_id').references(() => backupJobs.id),
  agentId:      text('agent_id').references(() => agents.id),
  repositoryId: text('repository_id').references(() => repositories.id),

  status:  text('status').notNull(), // 'running'|'success'|'failed'|'cancelled'
  trigger: text('trigger').notNull(), // 'scheduled'|'manual'|'api'
  snapshotId: text('snapshot_id'),  // Restic snapshot ID on success

  // Stats
  filesNew:        integer('files_new'),
  filesChanged:    integer('files_changed'),
  filesUnmodified: integer('files_unmodified'),
  dataAdded:       integer('data_added'),   // bytes
  totalSize:       integer('total_size'),   // bytes
  duration:        integer('duration'),     // seconds

  // Errors
  errorMessage: text('error_message'),
  errorDetail:  text('error_detail'),       // JSON — full error context

  startedAt:   integer('started_at',   { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),

  log:    text('log'),
  phases: text('phases'),
})

// ── Snapshots ─────────────────────────────────────────────────────────────
// Cached snapshot list from Restic — synced on demand

export const snapshots = sqliteTable('snapshots', {
  id:           text('id').primaryKey(), // Restic snapshot short ID
  repositoryId: text('repository_id').references(() => repositories.id),
  jobId:        text('job_id').references(() => backupJobs.id),
  hostname:     text('hostname'),
  paths:        text('paths'), // JSON array
  tags:         text('tags'),  // JSON array
  pinned:        integer('pinned',         { mode: 'boolean' }).default(false),
  retentionHold: integer('retention_hold', { mode: 'boolean' }).default(false),
  holdReason:    text('hold_reason'),
  holdExpiresAt: integer('hold_expires_at', { mode: 'timestamp' }),
  customTags:    text('custom_tags'),
  sizeBytes:    integer('size_bytes'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Restore specs ─────────────────────────────────────────────────────────
// YAML-defined restore procedures stored in the DB

export const restoreSpecs = sqliteTable('restore_specs', {
  id:               text('id').primaryKey(),
  name:             text('name').notNull(),
  description:      text('description'),
  yamlContent:      text('yaml_content').notNull(),
  jobId:            text('job_id').references(() => backupJobs.id),
  repositoryId:     text('repository_id').references(() => repositories.id),
  lastValidatedAt:  integer('last_validated_at', { mode: 'timestamp' }),
  validationStatus: text('validation_status'), // 'valid'|'invalid'|'untested'
  createdAt:        integer('created_at',       { mode: 'timestamp' }).notNull(),
})

// ── Restore runs ──────────────────────────────────────────────────────────

export const restoreRuns = sqliteTable('restore_runs', {
  id:          text('id').primaryKey(),
  specId:      text('spec_id').references(() => restoreSpecs.id),
  snapshotId:  text('snapshot_id'),
  status:      text('status').notNull(), // 'running'|'success'|'failed'
  log:         text('log'),              // full restore log
  trigger:     text('trigger'),          // 'manual'|'scheduled_test'|'api'
  startedAt:   integer('started_at',   { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// ── Third-party monitors ──────────────────────────────────────────────────
// Monitoring integrations for existing backup solutions

export const backupMonitors = sqliteTable('backup_monitors', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),   // 'proxmox_pbs'|'borg'|'duplicati'|'veeam'|'restic_repo'
  group:        text('group'),
  config:       text('config').notNull(), // JSON, encrypted — connection details
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  status:       text('status').default('unknown'), // 'healthy'|'warning'|'error'|'unknown'
  createdAt:    integer('created_at',     { mode: 'timestamp' }).notNull(),
})

// ── Monitor results ───────────────────────────────────────────────────────

export const monitorResults = sqliteTable('monitor_results', {
  id:               text('id').primaryKey(),
  monitorId:        text('monitor_id').references(() => backupMonitors.id),
  status:           text('status').notNull(),
  lastBackupAt:     integer('last_backup_at',     { mode: 'timestamp' }),
  lastBackupStatus: text('last_backup_status'),
  sizeBytes:        integer('size_bytes'),
  details:          text('details'),    // JSON — monitor-specific data
  checkedAt:        integer('checked_at', { mode: 'timestamp' }).notNull(),
})

// ── Alert rules ───────────────────────────────────────────────────────────

export const alertRules = sqliteTable('alert_rules', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  type:       text('type').notNull(),
  // 'backup_failed'|'backup_missed'|'repo_check_failed'|'storage_warning'|'agent_disconnected'
  targetType: text('target_type'), // 'job'|'monitor'|'repository'|'agent'|'any'
  targetId:   text('target_id'),
  config:     text('config').notNull(), // JSON — thresholds, channels
  enabled:    integer('enabled', { mode: 'boolean' }).default(true),
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp' }),
})

// ── Audit log ─────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id:           text('id').primaryKey(),
  action:       text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId:   text('resource_id'),
  resourceName: text('resource_name'),
  actor:        text('actor').default('system'),
  detail:       text('detail'),
  prevHash:     text('prev_hash'),
  hash:         text('hash'),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => ({
  createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
}))

// ── Operational logs ──────────────────────────────────────────────────────
// Structured logs from backup engine, agents, web app (§4.1, §4.2)

export const operationalLogs = sqliteTable('logs', {
  id:         text('id').primaryKey(),
  level:      text('level').notNull(),
  component:  text('component').notNull(),
  message:    text('message').notNull(),
  payload:    text('payload'),
  entityType: text('entity_type'),
  entityId:   text('entity_id'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => ({
  entityIdx:    index('logs_entity_idx').on(t.entityType, t.entityId),
  createdAtIdx: index('logs_created_at_idx').on(t.createdAt),
}))

// ── Logging config ─────────────────────────────────────────────────────────

export const loggingConfig = sqliteTable('logging_config', {
  id:                text('id').primaryKey().default('singleton'), // always upsert with id='singleton'
  activityRetention: text('activity_retention').notNull().default('90d'),
  auditRetention:    text('audit_retention').notNull().default('365d'),
  opsRetention:      text('ops_retention').notNull().default('14d'),
  updatedAt:         integer('updated_at', { mode: 'timestamp' }),
})

// ── Hypervisor integrations ────────────────────────────────────────────────
// Connection config for hypervisor APIs (separate from backup jobs)

export const hypervisorIntegrations = sqliteTable('hypervisor_integrations', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),   // 'proxmox'|'xcpng'|'vmware'
  config:       text('config').notNull(), // JSON, encrypted — URL, token, etc.
  status:       text('status').default('unknown'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt:    integer('created_at',     { mode: 'timestamp' }).notNull(),
})

// ── Hypervisor targets ────────────────────────────────────────────────────
// Cached list of VMs/LXCs from hypervisor sync

export const hypervisorTargets = sqliteTable('hypervisor_targets', {
  id:            text('id').primaryKey(),
  integrationId: text('integration_id').references(() => hypervisorIntegrations.id),
  externalId:    text('external_id').notNull(), // vmid, uuid, etc.
  name:          text('name').notNull(),
  type:          text('type').notNull(), // 'qemu'|'lxc'|'xcpng_vm'|'vmware_vm'
  node:          text('node'),           // hypervisor node/host
  status:        text('status'),         // 'running'|'stopped'
  osType:        text('os_type'),
  tags:          text('tags'),           // JSON array
  meta:          text('meta'),           // JSON — hypervisor-specific fields
  lastSeenAt:    integer('last_seen_at', { mode: 'timestamp' }),
})

// ── Repository metrics ─────────────────────────────────────────────────────
// Storage health and cost tracking (section 19)

export const repositoryMetrics = sqliteTable('repository_metrics', {
  id:           text('id').primaryKey(),
  repositoryId: text('repository_id').references(() => repositories.id),

  // Size tracking
  totalSizeBytes:  integer('total_size_bytes'),
  uniqueSizeBytes: integer('unique_size_bytes'),  // deduplicated size
  compressionRatio: integer('compression_ratio'), // stored as integer * 100

  // API call tracking (for cost estimation)
  monthlyPutCount: integer('monthly_put_count'),
  monthlyGetCount: integer('monthly_get_count'),

  // Growth tracking
  sizeGrowthBytes7d:  integer('size_growth_bytes_7d'),
  sizeGrowthBytes30d: integer('size_growth_bytes_30d'),

  // Cost (computed, cached — stored in cents)
  estimatedMonthlyCostUSD:     integer('estimated_monthly_cost_usd'),
  estimatedFullRestoreCostUSD: integer('estimated_full_restore_cost_usd'),

  // Integrity
  lastCheckAt:        integer('last_check_at', { mode: 'timestamp' }),
  lastCheckStatus:    text('last_check_status'),   // 'ok'|'errors'
  lastCheckErrorCount: integer('last_check_error_count'),

  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

// ── Storage alerts ─────────────────────────────────────────────────────────

export const storageAlerts = sqliteTable('storage_alerts', {
  id:           text('id').primaryKey(),
  repositoryId: text('repository_id').references(() => repositories.id),
  type:         text('type').notNull(),
  // 'growth_spike'|'cost_threshold'|'integrity_error'|'no_recent_backup'|'approaching_limit'
  severity:   text('severity'),   // 'info'|'warning'|'critical'
  message:    text('message').notNull(),
  detail:     text('detail'),
  firedAt:    integer('fired_at',    { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
})

// ── Verification tests ─────────────────────────────────────────────────────
// Scheduled restore verification test configuration

export const verificationTests = sqliteTable('verification_tests', {
  id:             text('id').primaryKey(),
  name:           text('name').notNull(),
  jobId:          text('job_id').references(() => backupJobs.id),
  targetType:     text('target_type').notNull(),
  // 'temp_directory' | 'docker_volume' | 'proxmox_vm_clone' | 'ssh_target'
  targetConfig:   text('target_config'),   // JSON — target-specific config
  validationHook: text('validation_hook'), // shell command run after restore
  schedule:       text('schedule'),        // cron expression
  enabled:        integer('enabled', { mode: 'boolean' }).default(true),
  lastResult:     text('last_result'),     // 'passed' | 'failed' | null
  lastRunAt:      integer('last_run_at',  { mode: 'timestamp' }),
  nextRunAt:      integer('next_run_at',  { mode: 'timestamp' }),
  createdAt:      integer('created_at',   { mode: 'timestamp' }).notNull(),
})

// ── Verification runs ──────────────────────────────────────────────────────
// Each execution of a verification test

export const verificationRuns = sqliteTable('verification_runs', {
  id:           text('id').primaryKey(),
  testId:       text('test_id').references(() => verificationTests.id),
  status:       text('status').notNull(), // 'running' | 'passed' | 'failed'
  log:          text('log'),              // full log output
  errorMessage: text('error_message'),
  startedAt:    integer('started_at',   { mode: 'timestamp' }).notNull(),
  completedAt:  integer('completed_at', { mode: 'timestamp' }),
})

// ── Bandwidth profiles ────────────────────────────────────────────────────
// Named bandwidth limit profiles assignable to backup jobs

export const bandwidthProfiles = sqliteTable('bandwidth_profiles', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  isGlobal:    integer('is_global', { mode: 'boolean' }).default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const bandwidthRules = sqliteTable('bandwidth_rules', {
  id:        text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => bandwidthProfiles.id),
  startHour: integer('start_hour').notNull(),
  endHour:   integer('end_hour').notNull(),
  limitKbps: integer('limit_kbps'),
})

// ── Auth (better-auth) ────────────────────────────────────────────────────

export const user = sqliteTable('user', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  email:           text('email').notNull().unique(),
  emailVerified:   integer('email_verified',    { mode: 'boolean' }).notNull().default(false),
  image:           text('image'),
  createdAt:       integer('created_at',        { mode: 'timestamp' }).notNull(),
  updatedAt:       integer('updated_at',        { mode: 'timestamp' }).notNull(),
  // Extended profile fields
  displayName:     text('display_name'),
  phone:           text('phone'),
  phoneVerifiedAt: integer('phone_verified_at', { mode: 'timestamp' }),
  timezone:        text('timezone').notNull().default('UTC'),
  language:        text('language').notNull().default('en'),
  emailNotify:     integer('email_notify',      { mode: 'boolean' }).notNull().default(true),
  smsNotify:       integer('sms_notify',        { mode: 'boolean' }).notNull().default(false),
  notifyAlerts:    integer('notify_alerts',     { mode: 'boolean' }).notNull().default(true),
  notifyWeekly:    integer('notify_weekly',     { mode: 'boolean' }).notNull().default(true),
  notifyUpdates:   integer('notify_updates',    { mode: 'boolean' }).notNull().default(false),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
})

export const session = sqliteTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token:     text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('account_id').notNull(),
  providerId:            text('provider_id').notNull(),
  userId:                text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:           text('access_token'),
  refreshToken:          text('refresh_token'),
  idToken:               text('id_token'),
  accessTokenExpiresAt:  integer('access_token_expires_at',  { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:             integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:  integer('updated_at', { mode: 'timestamp' }),
})

export const twoFactorSecrets = sqliteTable('two_factor', {
  id:          text('id').primaryKey(),
  secret:      text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId:      text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
})
