import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

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
  lastSeenAt:   integer('last_seen_at',   { mode: 'timestamp_ms' }),
  enrolledAt:   integer('enrolled_at',    { mode: 'timestamp_ms' }).notNull(),
  publicKey:    text('public_key').notNull(), // Ed25519
  protocolVersion: text('protocol_version'),
  resticVersion:   text('restic_version'),
  capabilities:    text('capabilities'),       // JSON array of strings
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
  // ── NFS agent-mount config (used when backend='nfs' and mode is agent-side) ──
  nfsServer:       text('nfs_server'),
  nfsExport:       text('nfs_export'),
  nfsOptions:      text('nfs_options'),
  sizeBytes:       integer('size_bytes'),
  snapshotCount:   integer('snapshot_count'),
  initializedAt:   integer('initialized_at',    { mode: 'timestamp_ms' }),
  lastCheckedAt:   integer('last_checked_at',   { mode: 'timestamp_ms' }),
  lastCheckStatus: text('last_check_status'),   // 'ok' | 'errors' | 'unknown'
  createdAt:          integer('created_at',           { mode: 'timestamp_ms' }).notNull(),
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
  createdAt:   integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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

  lastRunAt:     integer('last_run_at',     { mode: 'timestamp_ms' }),
  lastRunStatus: text('last_run_status'),   // 'success' | 'failed' | 'running'
  nextRunAt:     integer('next_run_at',     { mode: 'timestamp_ms' }),
  createdAt:     integer('created_at',      { mode: 'timestamp_ms' }).notNull(),
  bandwidthProfileId: text('bandwidth_profile_id').references(() => bandwidthProfiles.id),

  // Per-job schedule window override (0-23 hours; null = use global default)
  scheduleStart: integer('schedule_start'),
  scheduleEnd:   integer('schedule_end'),

  // Pre-flight checks
  preflightEnabled:    integer('preflight_enabled',    { mode: 'boolean' }).default(true),
  lastPreflightAt:     integer('last_preflight_at',    { mode: 'timestamp_ms' }),
  lastPreflightStatus: text('last_preflight_status'),  // 'ok' | 'warning' | 'failed' | null
  infraServiceId: text('infra_service_id').references(() => infraOsServices.id),
})

// ── Backup runs ───────────────────────────────────────────────────────────
// Each execution of a backup job

export const backupRuns = sqliteTable('backup_runs', {
  id:           text('id').primaryKey(),
  jobId:        text('job_id').references(() => backupJobs.id, { onDelete: 'set null' }),
  agentId:      text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  repositoryId: text('repository_id').references(() => repositories.id, { onDelete: 'set null' }),

  status:  text('status').notNull(), // 'running'|'success'|'failed'|'cancelled'
  trigger: text('trigger').notNull(), // 'scheduled'|'manual'|'api'
  snapshotId:  text('snapshot_id'),   // Restic snapshot ID on success (single-snapshot jobs)
  snapshotIds: text('snapshot_ids'),  // JSON string[] for compose backups (multiple snapshots)

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

  startedAt:       integer('started_at',        { mode: 'timestamp_ms' }).notNull(),
  completedAt:     integer('completed_at',      { mode: 'timestamp_ms' }),
  lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp_ms' }),
  phase:           text('phase'),

  log:    text('log'),
  phases: text('phases'),

  // Live progress (updated every ~2s during local execution)
  progressPct:  real('progress_pct'),
  bytesDone:    integer('bytes_done'),
  bytesTotal:   integer('bytes_total'),
  filesDone:    integer('files_done'),
  filesTotal:   integer('files_total'),

  // Retention (set after forget runs; null means no retention policy was configured)
  snapshotsRemoved: integer('snapshots_removed'),
  snapshotsKept:    integer('snapshots_kept'),

  // Resolved at trigger time — agent applies this limit (null = unlimited)
  bandwidthLimitKbps: integer('bandwidth_limit_kbps'),

  // 'backup' (default) or 'restore'
  runType: text('run_type').default('backup'),
}, t => ({
  jobIdIdx:     index('backup_runs_job_id_idx').on(t.jobId),
  startedAtIdx: index('backup_runs_started_at_idx').on(t.startedAt),
}))

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
  holdExpiresAt: integer('hold_expires_at', { mode: 'timestamp_ms' }),
  customTags:    text('custom_tags'),
  sizeBytes:    integer('size_bytes'),
  createdAt:    integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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
  lastValidatedAt:  integer('last_validated_at', { mode: 'timestamp_ms' }),
  validationStatus: text('validation_status'), // 'valid'|'invalid'|'untested'
  createdAt:        integer('created_at',       { mode: 'timestamp_ms' }).notNull(),
})

// ── Restore runs ──────────────────────────────────────────────────────────

export const restoreRuns = sqliteTable('restore_runs', {
  id:          text('id').primaryKey(),
  specId:      text('spec_id').references(() => restoreSpecs.id),
  snapshotId:  text('snapshot_id'),
  status:      text('status').notNull(), // 'running'|'success'|'failed'
  log:         text('log'),              // full restore log
  trigger:     text('trigger'),          // 'manual'|'scheduled_test'|'api'
  startedAt:   integer('started_at',   { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

// ── Third-party monitors ──────────────────────────────────────────────────
// Monitoring integrations for existing backup solutions

export const backupMonitors = sqliteTable('backup_monitors', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),   // 'proxmox_pbs'|'borg'|'duplicati'|'veeam'|'restic_repo'
  group:        text('group'),
  config:       text('config').notNull(), // JSON, encrypted — connection details
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
  status:       text('status').default('unknown'), // 'healthy'|'warning'|'error'|'unknown'
  createdAt:    integer('created_at',     { mode: 'timestamp_ms' }).notNull(),
})

// ── Monitor results ───────────────────────────────────────────────────────

export const monitorResults = sqliteTable('monitor_results', {
  id:               text('id').primaryKey(),
  monitorId:        text('monitor_id').references(() => backupMonitors.id),
  status:           text('status').notNull(),
  lastBackupAt:     integer('last_backup_at',     { mode: 'timestamp_ms' }),
  lastBackupStatus: text('last_backup_status'),
  sizeBytes:        integer('size_bytes'),
  details:          text('details'),    // JSON — monitor-specific data
  checkedAt:        integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
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
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp_ms' }),
  channelId:   text('channel_id'),
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
  createdAt:    integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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
  updatedAt:         integer('updated_at', { mode: 'timestamp_ms' }),
  lastSweepAt:            integer('last_sweep_at',              { mode: 'timestamp_ms' }),
  lastSweepDeletedAlerts: integer('last_sweep_deleted_alerts').default(0),
  lastSweepDeletedAudit:  integer('last_sweep_deleted_audit').default(0),
  lastSweepDeletedOps:    integer('last_sweep_deleted_ops').default(0),
})

// ── Hypervisor integrations ────────────────────────────────────────────────
// Connection config for hypervisor APIs (separate from backup jobs)

export const hypervisorIntegrations = sqliteTable('hypervisor_integrations', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),   // 'proxmox'|'xcpng'|'vmware'
  config:       text('config').notNull(), // JSON, encrypted — URL, token, etc.
  status:       text('status').default('unknown'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
  createdAt:    integer('created_at',     { mode: 'timestamp_ms' }).notNull(),
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
  lastSeenAt:    integer('last_seen_at', { mode: 'timestamp_ms' }),
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
  lastCheckAt:        integer('last_check_at', { mode: 'timestamp_ms' }),
  lastCheckStatus:    text('last_check_status'),   // 'ok'|'errors'
  lastCheckErrorCount: integer('last_check_error_count'),

  recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
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
  firedAt:    integer('fired_at',    { mode: 'timestamp_ms' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
})

// ── Alert instances ───────────────────────────────────────────────────────
// Fired alert instances, supports grouping and snoozing

export const alerts = sqliteTable('alerts', {
  id:           text('id').primaryKey(),
  ruleId:       text('rule_id'),
  parentId:     text('parent_id'),
  childCount:   integer('child_count').default(0),
  type:         text('type').notNull(),
  severity:     text('severity'),
  message:      text('message').notNull(),
  status:       text('status').notNull().default('open'),
  snoozedUntil: integer('snoozed_until', { mode: 'timestamp_ms' }),
  firedAt:      integer('fired_at',    { mode: 'timestamp_ms' }).notNull(),
  resolvedAt:   integer('resolved_at', { mode: 'timestamp_ms' }),
})

// ── Alert channels ────────────────────────────────────────────────────────
// Webhook destinations for alert delivery

export const alertChannels = sqliteTable('alert_channels', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  type:      text('type').notNull(),
  config:    text('config').notNull(),
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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
  lastRunAt:      integer('last_run_at',  { mode: 'timestamp_ms' }),
  nextRunAt:      integer('next_run_at',  { mode: 'timestamp_ms' }),
  createdAt:      integer('created_at',   { mode: 'timestamp_ms' }).notNull(),
})

// ── Verification runs ──────────────────────────────────────────────────────
// Each execution of a verification test

export const verificationRuns = sqliteTable('verification_runs', {
  id:           text('id').primaryKey(),
  testId:       text('test_id').references(() => verificationTests.id),
  status:       text('status').notNull(), // 'running' | 'passed' | 'failed'
  log:          text('log'),              // full log output
  errorMessage: text('error_message'),
  startedAt:    integer('started_at',   { mode: 'timestamp_ms' }).notNull(),
  completedAt:  integer('completed_at', { mode: 'timestamp_ms' }),
})

// ── Bandwidth profiles ────────────────────────────────────────────────────
// Named bandwidth limit profiles assignable to backup jobs

export const bandwidthProfiles = sqliteTable('bandwidth_profiles', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  isGlobal:    integer('is_global', { mode: 'boolean' }).default(false),
  createdAt:   integer('created_at', { mode: 'timestamp_ms' }).notNull(),
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
  createdAt:       integer('created_at',        { mode: 'timestamp_ms' }).notNull(),
  updatedAt:       integer('updated_at',        { mode: 'timestamp_ms' }).notNull(),
  // Extended profile fields
  displayName:     text('display_name'),
  phone:           text('phone'),
  phoneVerifiedAt: integer('phone_verified_at', { mode: 'timestamp_ms' }),
  timezone:        text('timezone').notNull().default('UTC'),
  language:        text('language').notNull().default('en'),
  emailNotify:     integer('email_notify',      { mode: 'boolean' }).notNull().default(true),
  smsNotify:       integer('sms_notify',        { mode: 'boolean' }).notNull().default(false),
  notifyAlerts:    integer('notify_alerts',     { mode: 'boolean' }).notNull().default(true),
  notifyWeekly:    integer('notify_weekly',     { mode: 'boolean' }).notNull().default(true),
  notifyUpdates:   integer('notify_updates',    { mode: 'boolean' }).notNull().default(false),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  role:             text('role').notNull().default('admin'),
})

export const session = sqliteTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token:     text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
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
  accessTokenExpiresAt:  integer('access_token_expires_at',  { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:             integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt:  integer('updated_at', { mode: 'timestamp_ms' }),
})

export const twoFactor = sqliteTable('two_factor', {
  id:          text('id').primaryKey(),
  secret:      text('secret').notNull(),
  backupCodes: text('backup_codes'),
  userId:      text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified:    integer('verified', { mode: 'boolean' }).default(true),
}, t => ({
  userIdIdx: index('two_factor_user_id_idx').on(t.userId),
  secretIdx: index('two_factor_secret_idx').on(t.secret),
}))

// ── Instance settings ─────────────────────────────────────────────────────
export const instanceSettings = sqliteTable('instance_settings', {
  id:              text('id').primaryKey().default('singleton'),
  instanceName:    text('instance_name').notNull().default('BackupOS'), // deprecated: removed from UI in #83 — not read by any consumer
  timezone:        text('timezone').notNull().default('UTC'),           // deprecated: removed from UI in #83 — not read by any consumer
  language:        text('language').notNull().default('en'),            // deprecated: removed from UI in #83 — not read by any consumer
  dateFormat:      text('date_format').notNull().default('YYYY-MM-DD'), // deprecated: removed from UI in #83 — not read by any consumer
  serverPublicUrl: text('server_public_url'), // e.g., http://192.168.69.52:3093
  instanceId:      text('instance_id'),        // stable UUID generated on first use
  updatedAt:       integer('updated_at', { mode: 'timestamp_ms' }),
})

// ── SMTP config ───────────────────────────────────────────────────────────
export const smtpConfig = sqliteTable('smtp_config', {
  id:        text('id').primaryKey().default('singleton'),
  host:      text('host'),
  port:      integer('port').default(587),
  username:  text('username'),
  password:  text('password'),
  fromName:  text('from_name').notNull().default('BackupOS'),
  fromEmail: text('from_email'),
  toAddresses: text('to_addresses'),
  tls:         integer('tls',     { mode: 'boolean' }).default(true),
  enabled:     integer('enabled', { mode: 'boolean' }).default(false),
  updatedAt:   integer('updated_at', { mode: 'timestamp_ms' }),
})

// ── API tokens ────────────────────────────────────────────────────────────
export const apiTokens = sqliteTable('api_tokens', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  tokenHash:   text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  lastUsedAt:  integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt:   integer('expires_at',   { mode: 'timestamp_ms' }),
  createdAt:   integer('created_at',   { mode: 'timestamp_ms' }).notNull(),
})

// ── Integration tokens ────────────────────────────────────────────────────
// Scoped API tokens for external consumers (e.g. InfraOS federation)
export const integrationTokens = sqliteTable('integration_tokens', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  tokenHash:    text('token_hash').notNull().unique(),
  tokenPrefix:  text('token_prefix').notNull(),
  scopes:       text('scopes').notNull(),            // JSON array of scope strings
  expiresAt:    integer('expires_at',   { mode: 'timestamp_ms' }),
  createdAt:    integer('created_at',   { mode: 'timestamp_ms' }).notNull(),
  createdBy:    text('created_by').notNull().references(() => user.id),
  lastUsedAt:   integer('last_used_at', { mode: 'timestamp_ms' }),
  revokedAt:    integer('revoked_at',   { mode: 'timestamp_ms' }),
  rateLimitRpm: integer('rate_limit_rpm').notNull().default(60),
}, t => ({
  hashIdx: index('integration_tokens_hash_idx').on(t.tokenHash),
}))

// ── Backup defaults ───────────────────────────────────────────────────────
export const backupDefaults = sqliteTable('backup_defaults', {
  id:            text('id').primaryKey().default('singleton'),
  keepLast:      integer('keep_last').default(10),
  keepDaily:     integer('keep_daily').default(7),
  keepWeekly:    integer('keep_weekly').default(4),
  keepMonthly:   integer('keep_monthly').default(12),
  keepYearly:    integer('keep_yearly').default(0),
  scheduleStart: integer('schedule_start').default(0),
  scheduleEnd:   integer('schedule_end').default(23),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' }),
})

// ─── User Invites ───────────────────────────────────────────────────────────

export const invite = sqliteTable('invite', {
  id:        text('id').primaryKey(),
  email:     text('email').notNull(),
  name:      text('name'),
  token:     text('token').notNull().unique(),
  role:      text('role').notNull().default('viewer'),
  createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt:    integer('used_at'),
  createdAt: integer('created_at').notNull(),
})

// ── PBS-compatible backend ──────────────────────────────────────────────
// Tables for the Proxmox Backup Server protocol implementation.
// Design: docs/design/pbs-backend.md.
// Milestone 0 ships these tables as scaffolding; behavior lands in later
// milestones (1 onward).

export const pbsDatastores = sqliteTable('pbs_datastores', {
  id:                text('id').primaryKey(),
  name:              text('name').notNull().unique(),
  path:              text('path').notNull(),
  createdAt:         integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  pruneSchedule:     text('prune_schedule'),
  gcSchedule:         text('gc_schedule'),
  gcScheduleInterval: text('gc_schedule_interval'),
  lastGcAt:           integer('last_gc_at', { mode: 'timestamp_ms' }),
  totalSizeBytes:    integer('total_size_bytes'),
  uniqueSizeBytes:   integer('unique_size_bytes'),
  chunkCount:        integer('chunk_count'),
})

export const pbsTokens = sqliteTable('pbs_tokens', {
  id:           text('id').primaryKey(),
  datastoreId:  text('datastore_id').references(() => pbsDatastores.id),
  user:         text('user').notNull(),
  realm:        text('realm').notNull(),
  tokenName:    text('token_name').notNull(),
  secretHash:   text('secret_hash').notNull(),
  permissions:  text('permissions').notNull(),
  expiresAt:    integer('expires_at', { mode: 'timestamp_ms' }),
  createdAt:    integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastUsedAt:   integer('last_used_at', { mode: 'timestamp_ms' }),
})

export const pbsActiveSessions = sqliteTable('pbs_active_sessions', {
  id:           text('id').primaryKey(),
  tokenId:      text('token_id').references(() => pbsTokens.id),
  datastoreId:  text('datastore_id').references(() => pbsDatastores.id),
  backupType:   text('backup_type').notNull(),
  backupId:     text('backup_id').notNull(),
  backupTime:   integer('backup_time', { mode: 'timestamp_ms' }).notNull(),
  startedAt:    integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  state:        text('state').notNull(),
  scratchPath:  text('scratch_path'),
  namespace:    text('namespace').default(''),
})

export const pbsActiveWrites = sqliteTable('pbs_active_writes', {
  wid:          text('wid').primaryKey(),
  sessionId:    text('session_id').references(() => pbsActiveSessions.id),
  archiveName:  text('archive_name').notNull(),
  indexType:    text('index_type').notNull(),
  chunkSize:    integer('chunk_size'),
  totalSize:    integer('total_size'),
  digestList:   text('digest_list'),
  sizeList:     text('size_list'),
})
