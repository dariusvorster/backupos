import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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
  createdAt:       integer('created_at',        { mode: 'timestamp' }).notNull(),
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
  detail:       text('detail'),    // JSON
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
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
