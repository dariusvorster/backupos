# BackupOS — Product Specification
**Version:** 2.0 | **Date:** April 2026 | **Author:** Darius
**Domain:** backupos.app
**Tagline:** One backup platform for your entire homelab.

> BackupOS is a self-hosted backup management platform built on Restic.
> It backs up Proxmox VMs/LXCs, Linux hosts, Windows machines, Docker containers,
> databases, and NAS devices — from one dashboard, to one repository, with
> YAML-defined restore specs that actually work.
>
> For Proxmox PBS users: BackupOS replaces PBS and adds everything PBS can't do.
> For everyone else: BackupOS means you never need PBS.
>
> **BackupOS** = standalone self-hosted product (MIT)
> **BackupOS Cloud** = managed cloud service ($9/$29/mo)
> **Infra OS V3 module** = BackupOS core imported as a package into Infra OS

---

## 1. The Problem

Homelab backup is fragmented and broken in two distinct ways.

**The tool fragmentation problem:** You run Proxmox PBS for VMs, Duplicati for
files, a cron + pg_dump script for databases, and nothing for Windows. Four
systems, four UIs, four failure modes, no unified view of whether anything
actually worked last night.

**The corruption problem:** Duplicity's incremental chains corrupt silently.
PBS works great for Proxmox but knows nothing about your databases or Windows
machines. Most operators discover their backups are broken the moment they need
them.

BackupOS solves both with four principles:
1. **Unified platform** — VMs, containers, databases, bare metal Linux, Windows,
   NAS — all in one dashboard, all backed by the same Restic engine.
2. **Content-addressed storage** — every chunk SHA-256 verified. No chains,
   no corruption, no mystery. Same deduplication model as PBS.
3. **Application-aware** — knows Postgres needs `pg_dump`, Windows needs VSS,
   Proxmox VMs need a quiesced snapshot. Stops naive file copies of live systems.
4. **YAML restore specs** — your restore procedure is a file in your repo.
   Not a mental model. A file you can test.

---

## 2. Target Users

**Primary — PBS migration:** Proxmox homelab operators who want the deduplication
and incremental-forever model of PBS but need it to also cover databases, Docker
containers, Windows machines, and NAS devices that PBS ignores.

**Primary — no PBS:** Homelab operators who haven't set up PBS yet and want a
single solution rather than assembling PBS + Duplicati + pg_dump scripts.

**Secondary:** Small self-hosted teams needing backup without a dedicated ops
person. Indie devs running mixed Linux/Windows stacks.

**Not targeting:** Enterprise tape, Kubernetes-native backup (Velero),
cold archival at petabyte scale.

---

## 2a. Positioning vs Proxmox PBS

| Capability | Proxmox PBS | BackupOS |
|------------|-------------|----------|
| Proxmox VM/LXC backup | ✓ native | ✓ via Proxmox API |
| Incremental-forever | ✓ | ✓ Restic content-addressing |
| Deduplication | ✓ | ✓ Restic chunks |
| Linux bare metal | ✗ | ✓ agent |
| Windows (VSS) | ✗ | ✓ agent |
| Database-aware (pg_dump, mysqldump) | ✗ | ✓ |
| Docker/Podman containers | ✗ | ✓ |
| NAS devices | ✗ | ✓ agent |
| Non-Proxmox hypervisors (XCP-ng, VMware) | ✗ | ✓ |
| YAML restore specs | ✗ | ✓ |
| Backup destination | PBS datastore only | S3, R2, B2, SFTP, local, rclone |
| Multi-hypervisor | ✗ | ✓ |
| Web UI | ✓ | ✓ |

**Migration path from PBS:** BackupOS can monitor your existing PBS instance
while you migrate jobs over one by one. You don't have to cut over all at once.

---

## 3. Product Tiers

| Tier | Name | Price | Notes |
|------|------|-------|-------|
| Self-hosted | BackupOS | $0 | MIT, unlimited targets, single user |
| Cloud | BackupOS Cloud Solo | $9/mo | Managed, up to 5 agents |
| Cloud | BackupOS Cloud Teams | $29/mo | Multi-user, unlimited agents |
| Module | Infra OS V3 | Included | BackupOS core as Infra OS integration |

---

## 4. Architecture Overview

```
backupos/
├── apps/
│   ├── web/                    # Next.js 15 — dashboard + API
│   ├── agent-linux/            # backupos-agent (Linux) — Bun binary, x64 + ARM64
│   └── agent-windows/          # backupos-agent (Windows) — Bun binary, x64, VSS-aware
├── packages/
│   ├── db/                     # Drizzle schema + SQLite/PostgreSQL
│   ├── api/                    # tRPC router
│   ├── engine/                 # Restic wrapper — core backup engine
│   ├── hypervisors/            # Hypervisor-level backup drivers
│   │   ├── proxmox.ts          # Proxmox API — vzdump + snapshot
│   │   ├── xcpng.ts            # XCP-ng / Xen Orchestra API
│   │   ├── vmware.ts           # VMware vSphere API (V2)
│   │   └── types.ts
│   ├── monitors/               # Third-party backup monitors (read-only)
│   │   ├── proxmox-pbs.ts
│   │   ├── borg.ts
│   │   ├── duplicati.ts
│   │   ├── veeam.ts
│   │   ├── restic-repo.ts
│   │   └── types.ts
│   ├── app-hooks/              # Application-aware pre/post hooks
│   │   ├── postgres.ts
│   │   ├── mysql.ts
│   │   ├── mariadb.ts
│   │   ├── mongodb.ts
│   │   ├── redis.ts
│   │   ├── sqlite.ts
│   │   ├── influxdb.ts
│   │   └── types.ts
│   ├── restore/                # YAML restore spec parser + executor
│   ├── agent-protocol/         # Shared WebSocket message types
│   └── types/                  # Shared TypeScript types
├── docker-compose.yml
└── .env.example
```

---

## 5. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 App Router | Consistent with Infra OS + MxWatch |
| API | tRPC v11 | Type-safe, shared with agent |
| ORM | Drizzle ORM | SQLite (standalone) / PostgreSQL (cloud) |
| Auth | better-auth | Email/password V1, SAML enterprise |
| Backup engine | Restic (binary) | Content-addressed, verified, no chains |
| Agent runtime | Bun compile → binary | ARM64 + x64, no Node runtime needed |
| Styling | Tailwind CSS v4 + shadcn/ui | Same design system |
| Jobs | node-cron V1, BullMQ V2 | In-process for self-hosted simplicity |
| Theme | Dark, blue accent `#4A9EFF` | Distinct from Infra OS (green) and MxWatch (blue-gray) |

**Why Restic:**
- Content-addressed chunks — same data = same hash = deduplication + no corruption
- Every snapshot is independently valid — no incremental chains
- `restic check` verifies the entire repository
- `restic mount` exposes snapshots as a FUSE filesystem for browsing
- `restic restore` is atomic
- Written in Go, single binary, no runtime dependencies
- Supports S3, R2, B2, SFTP, local, rclone backends natively

---

## 6. Database Schema

```typescript
// packages/db/schema.ts

// ── Agents ────────────────────────────────────────────────────────────────
// An agent is the backupos-agent binary running on a source host

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hostname: text('hostname'),
  ip: text('ip'),
  osInfo: text('os_info'),              // JSON: { os, arch, kernel }
  agentVersion: text('agent_version'),
  status: text('status').default('disconnected'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  enrolledAt: integer('enrolled_at', { mode: 'timestamp' }).notNull(),
  publicKey: text('public_key').notNull(), // Ed25519
})

// ── Repositories ──────────────────────────────────────────────────────────
// A Restic repository — where backups are stored

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  backend: text('backend').notNull(),   // 's3' | 'r2' | 'b2' | 'sftp' | 'local' | 'rclone'
  config: text('config').notNull(),     // JSON, encrypted — backend-specific connection details
  resticPassword: text('restic_password').notNull(), // encrypted with ENCRYPTION_KEY
  sizeBytes: integer('size_bytes'),
  snapshotCount: integer('snapshot_count'),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  lastCheckStatus: text('last_check_status'), // 'ok' | 'errors' | 'unknown'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Backup jobs ───────────────────────────────────────────────────────────
// A scheduled backup job — what to back up, where, and when

export const backupJobs = sqliteTable('backup_jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  agentId: text('agent_id').references(() => agents.id),
  repositoryId: text('repository_id').references(() => repositories.id),

  // What to back up
  sourceType: text('source_type').notNull(), // 'filesystem' | 'docker_volume' | 'docker_container' | 'podman_container' | 'database' | 'files'
  sourceConfig: text('source_config').notNull(), // JSON — source-specific config

  // Schedule
  schedule: text('schedule').notNull(),  // cron expression
  enabled: integer('enabled', { mode: 'boolean' }).default(true),

  // Retention
  keepLast: integer('keep_last'),
  keepDaily: integer('keep_daily'),
  keepWeekly: integer('keep_weekly'),
  keepMonthly: integer('keep_monthly'),
  keepYearly: integer('keep_yearly'),

  // Tags
  tags: text('tags'),                    // JSON array — restic tags

  // Hooks
  preHook: text('pre_hook'),             // JSON — AppHookConfig
  postHook: text('post_hook'),           // JSON — AppHookConfig

  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  lastRunStatus: text('last_run_status'), // 'success' | 'failed' | 'running'
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Backup runs ───────────────────────────────────────────────────────────
// Each execution of a backup job

export const backupRuns = sqliteTable('backup_runs', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => backupJobs.id),
  agentId: text('agent_id').references(() => agents.id),
  repositoryId: text('repository_id').references(() => repositories.id),

  status: text('status').notNull(),      // 'running' | 'success' | 'failed' | 'cancelled'
  trigger: text('trigger').notNull(),    // 'scheduled' | 'manual' | 'api'
  snapshotId: text('snapshot_id'),       // Restic snapshot ID on success

  // Stats
  filesNew: integer('files_new'),
  filesChanged: integer('files_changed'),
  filesUnmodified: integer('files_unmodified'),
  dataAdded: integer('data_added'),      // bytes
  totalSize: integer('total_size'),      // bytes
  duration: integer('duration'),         // seconds

  // Errors
  errorMessage: text('error_message'),
  errorDetail: text('error_detail'),     // JSON — full error context

  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// ── Snapshots ─────────────────────────────────────────────────────────────
// Cached snapshot list from Restic — synced on demand

export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),           // Restic snapshot short ID
  repositoryId: text('repository_id').references(() => repositories.id),
  jobId: text('job_id').references(() => backupJobs.id),
  hostname: text('hostname'),
  paths: text('paths'),                  // JSON array
  tags: text('tags'),                    // JSON array
  sizeBytes: integer('size_bytes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Restore specs ─────────────────────────────────────────────────────────
// YAML-defined restore procedures stored in the DB

export const restoreSpecs = sqliteTable('restore_specs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  yamlContent: text('yaml_content').notNull(),
  jobId: text('job_id').references(() => backupJobs.id),
  repositoryId: text('repository_id').references(() => repositories.id),
  lastValidatedAt: integer('last_validated_at', { mode: 'timestamp' }),
  validationStatus: text('validation_status'), // 'valid' | 'invalid' | 'untested'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Restore runs ──────────────────────────────────────────────────────────

export const restoreRuns = sqliteTable('restore_runs', {
  id: text('id').primaryKey(),
  specId: text('spec_id').references(() => restoreSpecs.id),
  snapshotId: text('snapshot_id'),
  status: text('status').notNull(),      // 'running' | 'success' | 'failed'
  log: text('log'),                      // full restore log
  trigger: text('trigger'),              // 'manual' | 'scheduled_test' | 'api'
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// ── Third-party monitors ──────────────────────────────────────────────────
// Monitoring integrations for existing backup solutions

export const backupMonitors = sqliteTable('backup_monitors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'proxmox_pbs' | 'borg' | 'duplicati' | 'veeam' | 'restic_repo'
  config: text('config').notNull(),      // JSON, encrypted — connection details
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  status: text('status').default('unknown'), // 'healthy' | 'warning' | 'error' | 'unknown'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Monitor results ───────────────────────────────────────────────────────

export const monitorResults = sqliteTable('monitor_results', {
  id: text('id').primaryKey(),
  monitorId: text('monitor_id').references(() => backupMonitors.id),
  status: text('status').notNull(),
  lastBackupAt: integer('last_backup_at', { mode: 'timestamp' }),
  lastBackupStatus: text('last_backup_status'),
  sizeBytes: integer('size_bytes'),
  details: text('details'),              // JSON — monitor-specific data
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
})

// ── Alert rules ───────────────────────────────────────────────────────────

export const alertRules = sqliteTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'backup_failed' | 'backup_missed' | 'repo_check_failed' | 'storage_warning' | 'agent_disconnected'
  targetType: text('target_type'),       // 'job' | 'monitor' | 'repository' | 'agent' | 'any'
  targetId: text('target_id'),
  config: text('config').notNull(),      // JSON — thresholds, channels
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp' }),
})

// ── Audit log ─────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  resourceName: text('resource_name'),
  actor: text('actor').default('system'),
  detail: text('detail'),                // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

---

## 7. Restic Engine Wrapper (`packages/engine/`)

```typescript
// packages/engine/restic.ts
// Wraps the restic binary — never shells out raw strings,
// always constructs commands from typed parameters.

export interface ResticConfig {
  repositoryUrl: string      // e.g. s3:https://... or /local/path
  password: string           // RESTIC_PASSWORD
  envVars: Record<string, string>  // backend credentials (AWS_*, etc.)
  binaryPath?: string        // defaults to 'restic' in PATH
}

export class ResticEngine {
  constructor(private config: ResticConfig) {}

  // Initialise a new repository
  async init(): Promise<void>

  // Run a backup
  async backup(opts: BackupOptions): Promise<BackupResult>

  // List snapshots
  async snapshots(tags?: string[]): Promise<Snapshot[]>

  // Check repository integrity
  async check(readData?: boolean): Promise<CheckResult>

  // Restore a snapshot
  async restore(snapshotId: string, target: string, include?: string[]): Promise<RestoreResult>

  // Forget + prune with retention policy
  async forget(policy: RetentionPolicy, prune?: boolean): Promise<ForgetResult>

  // Get repository stats
  async stats(): Promise<RepoStats>

  // Mount snapshot as FUSE filesystem (Linux only)
  async mount(snapshotId: string, mountPoint: string): Promise<void>
  async unmount(mountPoint: string): Promise<void>

  // Raw execution — typed, never string interpolation
  private async exec(args: string[], extraEnv?: Record<string, string>): Promise<ExecResult>
}

export interface BackupOptions {
  paths: string[]            // filesystem paths to back up
  tags?: string[]            // restic tags
  exclude?: string[]         // exclude patterns
  excludeFile?: string       // path to exclude file
  oneFileSystem?: boolean    // don't cross filesystem boundaries
  preHook?: () => Promise<void>   // run before backup
  postHook?: () => Promise<void>  // run after backup (always, even on failure)
}

export interface BackupResult {
  snapshotId: string
  filesNew: number
  filesChanged: number
  filesUnmodified: number
  dataAdded: number          // bytes
  totalSize: number          // bytes
  duration: number           // seconds
}

export interface RetentionPolicy {
  keepLast?: number
  keepDaily?: number
  keepWeekly?: number
  keepMonthly?: number
  keepYearly?: number
  keepTags?: string[]
}

export interface CheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}
```

---

## 8. Application-Aware Hooks (`packages/app-hooks/`)

The most important part of BackupOS. Every supported database has a typed
hook implementation that runs before and after the backup to ensure
consistency.

```typescript
// packages/app-hooks/types.ts

export interface AppHook {
  readonly appType: AppType
  readonly displayName: string

  // Called before restic backup runs
  // Must leave the app in a safe-to-copy state
  pre(config: AppHookConfig): Promise<PreHookResult>

  // Called after restic backup completes (success or failure)
  // Must restore normal operation
  post(config: AppHookConfig, preResult: PreHookResult): Promise<void>
}

export type AppType =
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'mongodb'
  | 'redis'
  | 'sqlite'
  | 'influxdb'
  | 'custom_shell'   // user-defined pre/post shell scripts

export interface AppHookConfig {
  appType: AppType
  // Connection details — encrypted at rest
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string            // encrypted
  containerName?: string       // if running in Docker/Podman
  customPreScript?: string     // for custom_shell
  customPostScript?: string
}

export interface PreHookResult {
  dumpPath?: string            // if a dump was created, path to include in backup
  frozenAt?: Date              // when the consistent state was achieved
  metadata: Record<string, unknown>
}
```

### PostgreSQL hook

```typescript
// packages/app-hooks/postgres.ts

export class PostgresHook implements AppHook {
  readonly appType = 'postgres' as const
  readonly displayName = 'PostgreSQL'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    // Strategy: pg_dump to a temp file, include in backup
    // This is safer than filesystem snapshot of data directory
    // because it produces a consistent, transportable dump

    const dumpPath = `/tmp/backupos-pg-${Date.now()}.sql.gz`

    // Build pg_dump command
    // Uses docker exec if containerName is set, direct otherwise
    const cmd = config.containerName
      ? ['docker', 'exec', config.containerName,
         'pg_dump', '-U', config.username, '-d', config.database,
         '--no-owner', '--no-acl', '-F', 'c']
      : ['pg_dump', '-h', config.host, '-p', String(config.port || 5432),
         '-U', config.username, '-d', config.database,
         '--no-owner', '--no-acl', '-F', 'c']

    await runAndGzip(cmd, dumpPath, { PGPASSWORD: config.password })

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'pg_dump', format: 'custom', compressed: true }
    }
  }

  async post(config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    // Remove temp dump file after backup completes
    if (preResult.dumpPath) {
      await fs.unlink(preResult.dumpPath).catch(() => {})
    }
  }
}
```

### MySQL / MariaDB hook

```typescript
export class MySQLHook implements AppHook {
  readonly appType = 'mysql' as const
  readonly displayName = 'MySQL / MariaDB'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    // Strategy: mysqldump with --single-transaction for InnoDB
    // (no table lock needed for InnoDB, safe for live databases)
    // For MyISAM: FLUSH TABLES WITH READ LOCK first

    const dumpPath = `/tmp/backupos-mysql-${Date.now()}.sql.gz`

    const cmd = config.containerName
      ? ['docker', 'exec', config.containerName,
         'mysqldump', '--single-transaction', '--routines', '--triggers',
         '-u', config.username, config.database]
      : ['mysqldump', '-h', config.host, '-P', String(config.port || 3306),
         '--single-transaction', '--routines', '--triggers',
         '-u', config.username, config.database]

    await runAndGzip(cmd, dumpPath, {
      MYSQL_PWD: config.password
    })

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'mysqldump', singleTransaction: true }
    }
  }

  async post(config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    if (preResult.dumpPath) {
      await fs.unlink(preResult.dumpPath).catch(() => {})
    }
  }
}
```

### Redis hook

```typescript
export class RedisHook implements AppHook {
  readonly appType = 'redis' as const
  readonly displayName = 'Redis'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    // Strategy: BGSAVE + wait for completion, then backup the .rdb file
    // BGSAVE is non-blocking — Redis continues serving while saving

    const redis = new Redis({ host: config.host, port: config.port, password: config.password })

    await redis.bgsave()

    // Poll until background save completes
    let saving = true
    while (saving) {
      const info = await redis.info('persistence')
      saving = info.includes('rdb_bgsave_in_progress:1')
      if (saving) await sleep(500)
    }

    const dbFilename = await redis.config('get', 'dbfilename')
    const dir = await redis.config('get', 'dir')
    const rdbPath = path.join(dir[1], dbFilename[1])

    await redis.quit()

    return {
      dumpPath: rdbPath,   // include this path in the restic backup
      frozenAt: new Date(),
      metadata: { strategy: 'bgsave', rdbPath }
    }
  }

  async post(config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    // RDB file stays in place — it's Redis's own file, don't delete it
  }
}
```

### SQLite hook

```typescript
export class SQLiteHook implements AppHook {
  readonly appType = 'sqlite' as const
  readonly displayName = 'SQLite'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    // Strategy: SQLite Online Backup API via .backup command
    // Creates a consistent copy without locking the original

    const dumpPath = `/tmp/backupos-sqlite-${Date.now()}.db`
    const db = new Database(config.database!)

    // .backup() uses the SQLite Online Backup API — safe for concurrent writes
    await db.backup(dumpPath)
    db.close()

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'online_backup', originalPath: config.database }
    }
  }

  async post(config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    if (preResult.dumpPath) {
      await fs.unlink(preResult.dumpPath).catch(() => {})
    }
  }
}
```

### App hook registry

```typescript
// packages/app-hooks/index.ts

export const APP_HOOK_REGISTRY: Record<AppType, AppHook> = {
  postgres:     new PostgresHook(),
  mysql:        new MySQLHook(),
  mariadb:      new MySQLHook(),   // same implementation
  mongodb:      new MongoDBHook(),
  redis:        new RedisHook(),
  sqlite:       new SQLiteHook(),
  influxdb:     new InfluxDBHook(),
  custom_shell: new CustomShellHook(),
}
```

---

## 10. Hypervisor Backup (`packages/hypervisors/`)

Hypervisor-level backups run without an agent inside the VM.
The BackupOS server talks directly to the hypervisor API, triggers a
consistent snapshot, exports the disk image, and feeds it to Restic.

For app-aware database backups inside VMs, the in-VM agent runs alongside
the hypervisor backup — two complementary approaches, not competing ones.

### Proxmox backup driver

```typescript
// packages/hypervisors/proxmox.ts

export class ProxmoxHypervisorDriver {

  // Back up a VM or LXC using vzdump
  // Equivalent to what PBS does — consistent snapshot via Proxmox API
  async backupVM(opts: ProxmoxBackupOptions): Promise<HypervisorBackupResult> {
    // 1. POST /nodes/{node}/qemu/{vmid}/snapshot  → create pre-backup snapshot
    // 2. POST /nodes/{node}/vzdump with:
    //    - mode: snapshot (QEMU) or stop (LXC, unless app hook available)
    //    - compress: zstd
    //    - storage: temporary local storage
    //    - remove: 1 (clean up after export)
    // 3. Wait for task to complete (poll GET /nodes/{node}/tasks/{upid}/status)
    // 4. Stream the .vma.zst or .tar.zst file to Restic
    //    (pipe vzdump output directly into `restic backup --stdin`)
    // 5. Delete the temporary vzdump file
    // 6. Delete the pre-backup snapshot (keep snapshots optional)
  }

  // List all VMs and LXCs across all cluster nodes
  async listTargets(): Promise<ProxmoxTarget[]> {
    // GET /nodes → list nodes
    // GET /nodes/{node}/qemu → list VMs
    // GET /nodes/{node}/lxc → list LXCs
    // Returns unified list with vmid, name, node, type, status
  }

  // Get current resource usage for a target
  async getStatus(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<VMStatus>
}

export interface ProxmoxBackupOptions {
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
  mode: 'snapshot' | 'suspend' | 'stop'  // snapshot recommended for QEMU
  includeMemory: boolean                   // include RAM state in snapshot
  notesTemplate?: string
}

export interface ProxmoxTarget {
  vmid: number
  name: string
  node: string
  type: 'qemu' | 'lxc'
  status: 'running' | 'stopped' | 'paused'
  tags: string[]
}
```

### XCP-ng backup driver

```typescript
// packages/hypervisors/xcpng.ts
// Uses Xen Orchestra API (xo-server) or direct XAPI

export class XCPNGHypervisorDriver {
  async backupVM(opts: XCPNGBackupOptions): Promise<HypervisorBackupResult> {
    // 1. Create VM snapshot via XAPI: VM.snapshot()
    // 2. Export snapshot to VHD via HTTP export endpoint
    // 3. Stream VHD through Restic
    // 4. Delete snapshot
  }

  async listTargets(): Promise<XCPNGTarget[]>
}
```

### Hypervisor source type in backup jobs

```typescript
// Extended sourceType enum
export type SourceType =
  | 'filesystem'           // paths on the agent host
  | 'docker_volume'        // Docker named volume
  | 'docker_container'     // Docker container (stop/start + app hook)
  | 'podman_container'     // Podman container
  | 'database'             // Database via app hook
  | 'files'                // specific file list
  | 'proxmox_vm'           // Proxmox VM via hypervisor API
  | 'proxmox_lxc'          // Proxmox LXC via hypervisor API
  | 'xcpng_vm'             // XCP-ng VM via Xen Orchestra API
  | 'vmware_vm'            // VMware VM via vSphere API (V2)
  | 'windows_system'       // Windows full system via VSS agent
  | 'nas_share'            // NAS share via agent or SSH

// Source config for Proxmox VM
export interface ProxmoxVMSourceConfig {
  hypervisorIntegrationId: string  // references an integration in BackupOS
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
  mode: 'snapshot' | 'suspend' | 'stop'
  includeMemory: boolean
  // Optional: also run app hooks inside the VM if agent is installed
  agentId?: string
  appHooks?: AppHookConfig[]
}
```

---

## 11. Windows Agent (`apps/agent-windows/`)

The Windows agent is a separate binary compiled for Windows x64.
It uses Restic's built-in `--use-fs-snapshot` flag which calls the
Windows VSS (Volume Shadow Copy Service) API to create a consistent
point-in-time snapshot before backup begins.

### Key differences from Linux agent

| Capability | Linux agent | Windows agent |
|-----------|-------------|---------------|
| Restic snapshot | Standard | `--use-fs-snapshot` (VSS) |
| Service management | systemd | Windows Service (via node-windows or NSSM) |
| Pre-hook | Shell scripts | PowerShell scripts |
| Database hooks | pg_dump, mysqldump, etc. | Same — runs in WSL or native |
| Path separators | `/` | `\` (Restic handles both) |
| Installation | `curl \| bash` | PowerShell installer script |

### VSS backup flow

```typescript
// apps/agent-windows/src/backup.ts

export async function runWindowsBackup(job: BackupJob, engine: ResticEngine): Promise<BackupResult> {

  // Pre-hooks run before VSS snapshot
  // This allows flushing databases before the shadow copy is taken
  if (job.preHook) {
    await runPreHook(job.preHook)
  }

  // restic backup --use-fs-snapshot automatically:
  // 1. Creates a VSS shadow copy of the volume
  // 2. Backs up from the shadow copy (consistent, no open file issues)
  // 3. Releases the shadow copy after backup
  const result = await engine.backup({
    paths: job.sourceConfig.paths,
    tags: job.tags,
    exclude: job.sourceConfig.exclude,
    useVSS: true,  // maps to --use-fs-snapshot in restic exec
  })

  if (job.postHook) {
    await runPostHook(job.postHook, result)
  }

  return result
}
```

### Windows install script (`install.ps1`)

```powershell
# Served at backupos-server/install.ps1
# Run as: irm https://backupos.local/install.ps1 | iex

param(
    [string]$ServerUrl = "__BACKUPOS_URL__",
    [string]$EnrollmentToken = "__ENROLLMENT_TOKEN__"
)

Write-Host "Installing BackupOS agent for Windows..."

# Download agent binary
$agentUrl = "$ServerUrl/agent/backupos-agent-windows-x64.exe"
$agentPath = "C:\Program Files\BackupOS\backupos-agent.exe"
New-Item -ItemType Directory -Force -Path "C:\Program Files\BackupOS" | Out-Null
Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath

# Download restic binary (Windows build)
$resticUrl = "https://github.com/restic/restic/releases/latest/download/restic_windows_amd64.zip"
$resticZip = "$env:TEMP\restic.zip"
Invoke-WebRequest -Uri $resticUrl -OutFile $resticZip
Expand-Archive -Path $resticZip -DestinationPath "C:\Program Files\BackupOS\" -Force

# Enroll agent
& $agentPath enroll --url $ServerUrl --token $EnrollmentToken

# Install as Windows service
& $agentPath service install
& $agentPath service start

Write-Host "BackupOS agent installed and running."
Write-Host "Node is now visible in BackupOS dashboard."
```

---

## 12. Extended DB Schema (additions for hypervisors + Windows)

```typescript
// packages/db/schema.ts — additions

// ── Hypervisor integrations ────────────────────────────────────────────────
// Connection config for hypervisor APIs (separate from backup jobs)

export const hypervisorIntegrations = sqliteTable('hypervisor_integrations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'proxmox' | 'xcpng' | 'vmware'
  config: text('config').notNull(),      // JSON, encrypted — URL, token, etc.
  status: text('status').default('unknown'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Hypervisor targets ────────────────────────────────────────────────────
// Cached list of VMs/LXCs from hypervisor sync

export const hypervisorTargets = sqliteTable('hypervisor_targets', {
  id: text('id').primaryKey(),
  integrationId: text('integration_id').references(() => hypervisorIntegrations.id),
  externalId: text('external_id').notNull(), // vmid, uuid, etc.
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'qemu' | 'lxc' | 'xcpng_vm' | 'vmware_vm'
  node: text('node'),                    // hypervisor node/host
  status: text('status'),               // 'running' | 'stopped'
  osType: text('os_type'),
  tags: text('tags'),                    // JSON array
  meta: text('meta'),                    // JSON — hypervisor-specific fields
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
})

// Add to agents table:
// platform: text — 'linux' | 'windows' | 'nas'
// arch: text — 'x64' | 'arm64'
// vssAvailable: integer (boolean) — Windows only
```

---

## 9. YAML Restore Spec Format

The restore spec is the core differentiator — your entire restore procedure
as a declarative YAML file that lives in version control.

```yaml
# restore-specs/gitbay-full.yaml
# Full restore spec for GitBay service
# Tested: 2026-04-13

name: gitbay-full
description: Full restore of GitBay — database, volumes, and config
version: "1.0"

# Which BackupOS repository to restore from
repository: homelab-r2

# Optional: target a specific snapshot (default: latest)
# snapshot: abc123de

steps:

  # Step 1: Restore PostgreSQL database
  - name: Restore GitBay database
    type: database_restore
    app: postgres
    snapshot_path: /tmp/backupos-pg-gitbay.sql.gz  # path inside the snapshot
    target:
      container: gitbay-db
      database: gitbay
      username: gitbay
    on_failure: abort  # abort | continue | notify_only

  # Step 2: Restore application files
  - name: Restore GitBay data volume
    type: filesystem_restore
    snapshot_path: /data/gitbay/repos
    target_path: /data/gitbay/repos
    on_failure: abort

  # Step 3: Restore config files
  - name: Restore config
    type: filesystem_restore
    snapshot_path: /etc/gitbay
    target_path: /etc/gitbay
    on_failure: notify_only

  # Step 4: Restart the service
  - name: Restart GitBay containers
    type: shell
    command: docker compose -f /opt/gitbay/docker-compose.yml up -d
    working_dir: /opt/gitbay
    on_failure: abort

  # Step 5: Health check
  - name: Verify GitBay is responding
    type: http_check
    url: https://gitbay.dev/api/health
    expected_status: 200
    timeout_seconds: 60
    retry_count: 5
    on_failure: notify_only

notifications:
  on_success:
    - channel: email
      to: darius@gitbay.dev
  on_failure:
    - channel: email
      to: darius@gitbay.dev
```

### Step types

```typescript
// packages/restore/types.ts

export type RestoreStepType =
  | 'filesystem_restore'   // restic restore to a path
  | 'database_restore'     // app-hook-aware database restore
  | 'shell'                // run a shell command on the agent
  | 'http_check'           // verify a URL responds correctly
  | 'container_restart'    // docker/podman restart
  | 'notify'               // send a notification

export type OnFailure = 'abort' | 'continue' | 'notify_only'
```

### Restore executor

```typescript
// packages/restore/executor.ts

export async function executeRestoreSpec(
  spec: ParsedRestoreSpec,
  snapshotId: string,
  agentId: string,
): Promise<RestoreRunResult> {

  const results: StepResult[] = []

  for (const step of spec.steps) {
    const stepResult = await executeStep(step, snapshotId, agentId)
    results.push(stepResult)

    if (!stepResult.success && step.onFailure === 'abort') {
      return {
        success: false,
        failedStep: step.name,
        steps: results,
        abortedAt: new Date(),
      }
    }
  }

  return {
    success: results.every(r => r.success || r.step.onFailure !== 'abort'),
    steps: results,
    completedAt: new Date(),
  }
}
```

---

## 10. Third-Party Monitor Adapters (`packages/monitors/`)

```typescript
// packages/monitors/types.ts

export interface BackupMonitorAdapter {
  readonly type: string
  readonly displayName: string

  test(config: MonitorConfig): Promise<{ ok: boolean; message?: string }>
  sync(config: MonitorConfig): Promise<MonitorSyncResult>
}

export interface MonitorSyncResult {
  status: 'healthy' | 'warning' | 'error'
  lastBackupAt?: Date
  lastBackupStatus?: string
  sizeBytes?: number
  jobCount?: number
  details: Record<string, unknown>
}
```

### Proxmox PBS monitor

```typescript
export class ProxmoxPBSMonitor implements BackupMonitorAdapter {
  readonly type = 'proxmox_pbs'
  readonly displayName = 'Proxmox Backup Server'

  async sync(config: MonitorConfig): Promise<MonitorSyncResult> {
    // GET /api2/json/status/datastores → datastore list + sizes
    // GET /api2/json/admin/datastore/{name}/snapshots → snapshot list
    // GET /api2/json/nodes/{node}/tasks → recent task results

    // Returns: last backup time per VM, success/fail status, datastore usage
  }
}
```

### Borg monitor

```typescript
export class BorgMonitor implements BackupMonitorAdapter {
  readonly type = 'borg'
  readonly displayName = 'BorgBackup'

  async sync(config: MonitorConfig): Promise<MonitorSyncResult> {
    // Executes: borg list --json {repo}
    // Executes: borg info --json {repo}::latest
    // Works via SSH to remote repos or agent exec for local repos
  }
}
```

### Monitor registry

```typescript
export const MONITOR_REGISTRY: Record<string, BackupMonitorAdapter> = {
  proxmox_pbs:   new ProxmoxPBSMonitor(),
  borg:          new BorgMonitor(),
  duplicati:     new DuplicatiMonitor(),
  veeam:         new VeeamMonitor(),
  restic_repo:   new ResticRepoMonitor(),  // monitor an existing restic repo not managed by BackupOS
}
```

---

## 11. tRPC Router

```typescript
export const appRouter = router({

  health: publicProcedure.query(() => ({ ok: true, version: PKG_VERSION })),

  // ── Hypervisors ────────────────────────────────────────────────────────
  hypervisors: router({
    list:     authedProcedure.query(/* all integrations + status */),
    create:   authedProcedure.input(HypervisorSchema).mutation(/* */),
    test:     authedProcedure.input(z.object({ id: z.string() })).mutation(/* ping API */),
    sync:     authedProcedure.input(z.object({ id: z.string() })).mutation(/* refresh VM list */),
    targets:  authedProcedure.input(z.object({ id: z.string() })).query(/* VMs/LXCs for this hypervisor */),
    delete:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Agents ────────────────────────────────────────────────────────────
  agents: router({
    list:     authedProcedure.query(/* all agents + status */),
    enroll:   authedProcedure.input(z.object({ name: z.string() })).mutation(/* one-time token + install command */),
    remove:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Repositories ──────────────────────────────────────────────────────
  repositories: router({
    list:     authedProcedure.query(/* all repos + stats */),
    create:   authedProcedure.input(RepositorySchema).mutation(/* init restic repo if new */),
    check:    authedProcedure.input(z.object({ id: z.string() })).mutation(/* restic check */),
    stats:    authedProcedure.input(z.object({ id: z.string() })).query(/* restic stats */),
    snapshots:authedProcedure.input(z.object({ id: z.string(), jobId: z.string().optional() })).query(/* */),
    delete:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Backup jobs ────────────────────────────────────────────────────────
  jobs: router({
    list:     authedProcedure.query(/* all jobs + last run status */),
    get:      authedProcedure.input(z.object({ id: z.string() })).query(/* */),
    create:   authedProcedure.input(JobSchema).mutation(/* */),
    update:   authedProcedure.input(JobUpdateSchema).mutation(/* */),
    delete:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
    run:      authedProcedure.input(z.object({ id: z.string() })).mutation(/* trigger manual run */),
    runs:     authedProcedure.input(z.object({ jobId: z.string(), limit: z.number().default(20) })).query(/* */),
  }),

  // ── Restore ────────────────────────────────────────────────────────────
  restore: router({
    specs: router({
      list:     authedProcedure.query(/* */),
      get:      authedProcedure.input(z.object({ id: z.string() })).query(/* */),
      upsert:   authedProcedure.input(RestoreSpecSchema).mutation(/* parse + validate YAML */),
      validate: authedProcedure.input(z.object({ yaml: z.string() })).mutation(/* parse + check refs */),
      delete:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
    }),
    run:        authedProcedure.input(z.object({ specId: z.string(), snapshotId: z.string().optional() })).mutation(/* */),
    history:    authedProcedure.input(z.object({ specId: z.string() })).query(/* */),
    browse:     authedProcedure.input(z.object({ repositoryId: z.string(), snapshotId: z.string(), path: z.string() })).query(/* restic ls */),
  }),

  // ── Monitors ──────────────────────────────────────────────────────────
  monitors: router({
    list:     authedProcedure.query(/* all monitors + latest result */),
    create:   authedProcedure.input(MonitorSchema).mutation(/* */),
    sync:     authedProcedure.input(z.object({ id: z.string() })).mutation(/* run adapter.sync() */),
    syncAll:  authedProcedure.mutation(/* */),
    delete:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Alerts ────────────────────────────────────────────────────────────
  alerts: router({
    rules: router({
      list:   authedProcedure.query(/* */),
      upsert: authedProcedure.input(AlertRuleSchema).mutation(/* */),
      delete: authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
    }),
    history:  authedProcedure.query(/* last 100 fired alerts */),
  }),

  // ── Dashboard ─────────────────────────────────────────────────────────
  dashboard: router({
    summary: authedProcedure.query(/* counts: jobs, repos, agents, last 24h run stats */),
    recentRuns: authedProcedure.query(/* last 20 backup runs across all jobs */),
    storageUsage: authedProcedure.query(/* per-repo storage breakdown */),
  }),

  // ── Audit ─────────────────────────────────────────────────────────────
  audit: router({
    list: authedProcedure.input(z.object({ limit: z.number().default(50) })).query(/* */),
  }),
})
```

---

## 12. Web App Pages

```
apps/web/app/
├── (auth)/
│   └── login/page.tsx
├── (dashboard)/
│   ├── layout.tsx               # App shell — sidebar + topbar
│   ├── page.tsx                 # → /dashboard
│   │
│   ├── dashboard/page.tsx       # Overview — job status grid, storage charts, recent runs
│   │
│   ├── jobs/
│   │   ├── page.tsx             # All backup jobs — status, last run, next run, schedule
│   │   ├── new/page.tsx         # New job wizard — source type → app hook → repo → schedule
│   │   └── [id]/
│   │       ├── page.tsx         # Job detail — config, run history, snapshots
│   │       └── runs/[runId]/page.tsx  # Run detail — log output, file stats
│   │
│   ├── repositories/
│   │   ├── page.tsx             # All repos — size, snapshot count, last check status
│   │   └── [id]/
│   │       ├── page.tsx         # Repo detail — stats, check history
│   │       └── snapshots/page.tsx  # Snapshot browser — list + file browser
│   │
│   ├── restore/
│   │   ├── page.tsx             # Restore specs list + recent restore runs
│   │   ├── new/page.tsx         # YAML editor for new restore spec
│   │   └── [id]/
│   │       ├── page.tsx         # Spec detail — YAML view, validation status
│   │       └── runs/page.tsx    # Restore run history
│   │
│   ├── monitors/
│   │   ├── page.tsx             # Third-party monitors — status, last sync
│   │   └── [id]/page.tsx        # Monitor detail — history, details
│   │
│   ├── agents/
│   │   ├── page.tsx             # Agent list — status, version, last seen
│   │   └── [id]/page.tsx        # Agent detail — jobs running on this agent
│   │
│   └── settings/
│       ├── page.tsx
│       ├── notifications/page.tsx
│       ├── tokens/page.tsx
│       └── account/page.tsx
```

---

## 13. Docker Deployment

```yaml
# docker-compose.yml — standalone self-hosted

services:
  backupos:
    image: ghcr.io/yourusername/backupos:latest
    container_name: backupos
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - backupos_data:/app/data
      - /usr/local/bin/restic:/usr/local/bin/restic:ro  # mount host restic binary
    environment:
      - DATABASE_URL=file:/app/data/backupos.db
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - RESEND_API_KEY=${RESEND_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  backupos_data:
```

**Note on restic binary:** Mount from host or download on container start.
Preferred: `RUN wget restic binary` in Dockerfile so it's self-contained.

---

## 14. Infra OS V3 Integration

BackupOS is a completely separate repo. Infra OS V3 imports it as a package.

```
// In Infra OS V3 docker-compose.yml:
// BackupOS runs as a sidecar or separate container
// Infra OS embeds a BackupOS iframe or uses its tRPC API directly

// infraos/packages/integrations/backup/backupos.ts
export class BackupOSAdapter implements IntegrationAdapter {
  readonly id = 'backupos'
  readonly category = 'backup' as const
  readonly displayName = 'BackupOS'

  async test(config: IntegrationConfig): Promise<TestResult> {
    // GET {backupos_url}/api/health
  }

  async sync(config: IntegrationConfig): Promise<SyncResult> {
    // Pulls job status, recent runs, repo health from BackupOS API
    // Surfaces in Infra OS topology as backup health per-node
  }
}
```

The Infra OS topology view shows each node's backup status:
```
llm-tools (LXC 200)
  ├── CPU 48% · RAM 68% · ● running
  ├── gitbay-app → tunnel:gitbay-cf → SSO:authentik → gitbay.dev
  └── Backup: ● last run 2h ago · 2.3 GB · BackupOS
```

---

## 15. V1 MVP Scope

### Build in V1
- [ ] Agent enrollment + WebSocket (Linux x64 + ARM64, Windows x64)
- [ ] Restic repository management (S3, R2, B2, SFTP, local)
- [ ] Backup jobs — filesystem, Docker volume, Docker container sources
- [ ] **Proxmox VM/LXC backup via Proxmox API** (vzdump → Restic)
- [ ] **Windows agent with VSS** (--use-fs-snapshot, PowerShell installer)
- [ ] node-cron scheduler
- [ ] Application hooks: PostgreSQL, MySQL/MariaDB, Redis, SQLite
- [ ] YAML restore spec — parser, validator, executor
- [ ] Snapshot browser (restic ls)
- [ ] Proxmox PBS monitor (migration path)
- [ ] Borg monitor
- [ ] Email alerts: backup_failed, backup_missed, agent_disconnected
- [ ] Dashboard — job grid, storage chart, agent status, recent runs
- [ ] Single Docker container deploy (server)
- [ ] Linux install script (`curl | bash`)
- [ ] Windows install script (PowerShell `irm | iex`)

### Defer to V2
- [ ] XCP-ng / Xen Orchestra backup driver
- [ ] VMware vSphere backup driver
- [ ] MongoDB hook
- [ ] InfluxDB hook
- [ ] Duplicati / Veeam monitors
- [ ] FUSE mount restore browser (restic mount)
- [ ] Scheduled automated restore tests (DR testing)
- [ ] BackupOS Cloud deploy (Hetzner, same pattern as MxWatch)
- [ ] Multi-user / Teams plan
- [ ] Infra OS V3 adapter
- [ ] NAS-specific agent (UGOS Container Manager deploy)
- [ ] Proxmox cluster-aware backup scheduling

---

## 16. Environment Variables

```env
DATABASE_URL=file:./data/backupos.db
ENCRYPTION_KEY=change-me-32-chars-minimum
BETTER_AUTH_SECRET=change-me-32-chars-minimum
NEXTAUTH_URL=http://localhost:3000

# Restic binary path (optional — defaults to 'restic' in PATH)
RESTIC_BINARY_PATH=/usr/local/bin/restic

# Alerts
RESEND_API_KEY=

# Optional: pre-seed a repository
BACKUPOS_REPO_URL=s3:https://<account>.r2.cloudflarestorage.com/backupos
BACKUPOS_REPO_PASSWORD=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## 17. Claude Code Kickoff Prompt

```
You are building BackupOS — a unified homelab backup platform.

BackupOS has three layers:
1. A Restic wrapper engine — runs application-aware backups
2. A hypervisor driver layer — backs up Proxmox VMs/LXCs via API
3. A monitoring layer — watches third-party backup solutions (PBS, Borg)

It also has two agents:
- Linux agent (Bun binary, x64 + ARM64) — filesystems, Docker, databases
- Windows agent (Bun binary, x64) — VSS-aware full system backup

Read backupos-spec.md completely before writing any code.
The spec is the source of truth. Do not deviate without asking.

Tech stack:
- Next.js 15 App Router + TypeScript
- tRPC v11
- Drizzle ORM — SQLite (self-hosted), PostgreSQL (cloud)
- better-auth email/password
- Tailwind CSS v4 + shadcn/ui
- Dark theme: bg #0B0E14, accent blue #4A9EFF
- JetBrains Mono headings + Outfit body
- pnpm + turborepo
- Bun compile for agent binaries

Build in this order. Confirm after each step:

STEP 1 — Monorepo scaffold
  apps/web, apps/agent-linux, apps/agent-windows
  packages/db, packages/api, packages/engine, packages/app-hooks,
  packages/hypervisors, packages/monitors, packages/restore,
  packages/agent-protocol, packages/types

STEP 2 — Database schema (packages/db)
  Full schema including hypervisorIntegrations + hypervisorTargets tables.
  getDb() factory: sqlite → self-hosted, postgres → cloud

STEP 3 — Restic engine (packages/engine)
  ResticEngine class. Typed exec — never raw string interpolation.
  Methods: init, backup, snapshots, check, restore, forget, stats.
  BackupOptions includes useVSS: boolean for Windows.

STEP 4 — Application hooks (packages/app-hooks)
  AppHook interface.
  Implement: PostgresHook, MySQLHook, RedisHook, SQLiteHook.
  Stub: MongoDBHook, InfluxDBHook, CustomShellHook.
  APP_HOOK_REGISTRY.

STEP 5 — Hypervisor drivers (packages/hypervisors)
  ProxmoxHypervisorDriver: listTargets(), backupVM() using vzdump API.
  XCPNGHypervisorDriver: stub (test() + empty sync()).
  HYPERVISOR_REGISTRY.

STEP 6 — Monitor adapters (packages/monitors)
  BackupMonitorAdapter interface.
  Implement: ProxmoxPBSMonitor, BorgMonitor.
  Stub: DuplicatiMonitor, VeeamMonitor, ResticRepoMonitor.
  MONITOR_REGISTRY.

STEP 7 — YAML restore spec (packages/restore)
  Parse + validate YAML. RestoreExecutor with abort/continue/notify.
  All step types: filesystem_restore, database_restore, shell,
  http_check, container_restart, notify.

STEP 8 — tRPC router (packages/api)
  All routers including hypervisors router.
  Wire engine + hooks + hypervisors + monitors into mutations.

STEP 9 — Web app shell + core pages
  App shell: dark sidebar (blue accent), topbar.
  Sidebar: Dashboard, Jobs, Hypervisors, Repositories, Restore,
           Monitors, Agents, Settings.
  /dashboard — job status grid, storage chart, agent status grid.
  /jobs — job list + new job wizard (source type includes Proxmox VM,
          Windows system; wizard shows app hook selector).
  /hypervisors — VM/LXC list per hypervisor + backup status.
  /restore — spec list + YAML editor + run history.
  /repositories — repo list + snapshot browser.
  /agents — Linux + Windows agents, platform badge, VSS indicator.

STEP 10 — Linux agent (apps/agent-linux)
  WebSocket client, metric collector, command executor (allowlist).
  Bun compile → backupos-agent-linux-x64, backupos-agent-linux-arm64.
  install.sh served at /install.sh.

STEP 11 — Windows agent (apps/agent-windows)
  Same WebSocket protocol as Linux agent.
  useVSS flag passed through to restic exec.
  install.ps1 served at /install.ps1.
  Bun compile → backupos-agent-windows-x64.exe.

STEP 12 — Docker Compose
  docker-compose.yml (SQLite, self-hosted).
  Restic binary bundled in Docker image.

After each step: tsc --noEmit, fix all type errors before proceeding.
Ask before adding any dependency not in the spec.
```

---

## 18. Infra OS Integration — Three Layers

> The integration advantage: Infra OS already knows your entire topology.
> BackupOS consumes that knowledge instead of re-discovering it.
> Together they close the loop: Infra OS manages your infra,
> BackupOS protects it, and the shared agent serves both.

---

### Layer 1 — API integration (loose coupling, works standalone)

BackupOS exposes a typed REST/tRPC API. Infra OS polls it to surface
backup health in the topology view. BackupOS remains fully functional
without Infra OS — the API is additive.

```typescript
// infraos/packages/integrations/backup/backupos.ts

export class BackupOSAdapter implements IntegrationAdapter {
  readonly id = 'backupos'
  readonly category = 'backup' as const
  readonly displayName = 'BackupOS'

  async test(config: IntegrationConfig): Promise<TestResult> {
    // GET {backupos_url}/api/health
    // Returns: { ok, version, jobCount, agentCount }
  }

  async sync(config: IntegrationConfig): Promise<SyncResult> {
    // GET {backupos_url}/api/infra-os/summary
    // Returns per-node backup status for topology enrichment
    // Maps nodeId (matched by IP or hostname) → BackupNodeStatus
  }
}

export interface BackupNodeStatus {
  nodeId: string           // Infra OS node ID (matched by IP)
  hasBackupJob: boolean
  lastRunAt?: Date
  lastRunStatus?: 'success' | 'failed' | 'running'
  lastSnapshotSize?: number
  jobCount: number
  repoNames: string[]
}
```

**What appears in Infra OS topology view:**
```
gitbay-dev (VM 101)
  ├── CPU 22% · RAM 41% · ● running
  ├── gitbay.dev → tunnel:gitbay-cf → SSO:authentik
  └── Backup: ● 2h ago · 4.2 GB · BackupOS (homelab-r2)

stalwart (VM 112)
  ├── CPU 12% · RAM 41% · ● running (1 drift)
  └── Backup: ⚠ no backup job configured   ← drift event

llm-tools (LXC 200)
  ├── CPU 48% · RAM 68% · ● running
  └── Backup: ↻ running now · BackupOS
```

**"No backup job configured" is a drift event.** When Infra OS syncs
BackupOS and finds a known node with no backup coverage, it creates a
`driftEvent` with `resourceType: 'node'`, `field: 'backup_coverage'`,
`declared: 'required'`, `actual: 'none'`. This surfaces in the drift
panel alongside config drift — unprotected nodes are infrastructure debt.

---

### Layer 2 — Shared agent (one install, dual purpose)

The ios-agent (Infra OS) and backupos-agent are merged into a single
binary: **ios-agent v2**. One install command enrolls a node with both
platforms simultaneously.

```
# Current (two separate installs):
curl -fsSL https://infraos.local/install.sh | bash -s -- --token ios_xxx
curl -fsSL https://backupos.local/install.sh | bash -s -- --token bos_xxx

# With shared agent (single install):
curl -fsSL https://infraos.local/install.sh | bash -s -- \
  --ios-token ios_xxx \
  --backupos-token bos_xxx \
  --backupos-url https://backupos.local

# Or if both are on the same host (most common for self-hosters):
curl -fsSL https://infraos.local/install.sh | bash -s -- \
  --ios-token ios_xxx \
  --backupos-integrated   # BackupOS uses the Infra OS connection
```

**Shared agent architecture:**

```typescript
// apps/agent/src/index.ts — unified agent

interface AgentConfig {
  // Infra OS connection
  infraosUrl: string
  infraosToken: string
  infraosNodeId: string

  // BackupOS connection — optional
  backupOSEnabled: boolean
  backupOSUrl?: string          // if separate instance
  backupOSToken?: string
  backupOSNodeId?: string

  // Shared
  writePermissions: AllowedCommand['kind'][]
  backupPermissions: BackupCommand['kind'][]
  metricsIntervalMs: number
}

// Agent maintains two WebSocket connections simultaneously:
// ws1: infraos-server/ws/agent    → metrics, exec commands
// ws2: backupos-server/ws/agent   → backup execution, progress

// If BackupOS is running on the same host as Infra OS,
// ws2 is a second multiplexed channel on the same connection.
```

**Unified message protocol additions for BackupOS:**

```typescript
// packages/agent-protocol/messages.ts — additions

export type BackupAgentMessage =
  | { type: 'backup_start';    jobId: string; config: BackupJobConfig }
  | { type: 'backup_progress'; jobId: string; filesProcessed: number; bytesProcessed: number }
  | { type: 'backup_complete'; jobId: string; snapshotId: string; stats: BackupStats }
  | { type: 'backup_failed';   jobId: string; error: string; detail: string }
  | { type: 'restore_start';   restoreId: string; specId: string }
  | { type: 'restore_progress';restoreId: string; step: string; status: string }
  | { type: 'restore_complete';restoreId: string; success: boolean }

export type BackupServerMessage =
  | { type: 'run_backup';      jobId: string; config: BackupJobConfig }
  | { type: 'run_restore';     restoreId: string; spec: ParsedRestoreSpec; snapshotId: string }
  | { type: 'cancel_backup';   jobId: string }
  | { type: 'verify_repo';     repoId: string; readData: boolean }
```

---

### Layer 3 — Auto-provisioning (topology → backup jobs)

The deepest integration. When Infra OS detects a new VM or service,
it can automatically create a BackupOS job for it based on rules
the operator defines.

```typescript
// infraos/packages/integrations/backup/auto-provision.ts

export interface BackupProvisioningRule {
  id: string
  name: string

  // Trigger: what triggers auto-provisioning
  trigger: {
    resourceType: 'node' | 'service' | 'container'
    conditions: {
      // Examples:
      // { field: 'type', operator: 'eq', value: 'qemu' }
      // { field: 'tags', operator: 'contains', value: 'production' }
      // { field: 'name', operator: 'matches', value: '^gitbay-.*' }
      field: string
      operator: 'eq' | 'contains' | 'matches' | 'exists'
      value: string
    }[]
  }

  // What job to create
  jobTemplate: {
    sourceType: SourceType
    repositoryId: string      // which BackupOS repo to use
    schedule: string          // cron expression
    retention: RetentionPolicy
    appHookDetection: 'auto' | 'none'
    // auto = BackupOS inspects running containers/services to detect databases
  }

  enabled: boolean
  dryRun: boolean             // log what would be created without acting
}

// Example rules:
const exampleRules: BackupProvisioningRule[] = [
  {
    name: "Back up all production VMs automatically",
    trigger: {
      resourceType: 'node',
      conditions: [
        { field: 'type', operator: 'eq', value: 'qemu' },
        { field: 'tags', operator: 'contains', value: 'production' }
      ]
    },
    jobTemplate: {
      sourceType: 'proxmox_vm',
      repositoryId: 'homelab-r2',
      schedule: '0 2 * * *',   // 2am daily
      retention: { keepLast: 5, keepDaily: 7, keepWeekly: 4, keepMonthly: 3 },
      appHookDetection: 'auto',
    }
  },
  {
    name: "Back up all new Docker containers",
    trigger: {
      resourceType: 'container',
      conditions: [
        { field: 'status', operator: 'eq', value: 'running' }
      ]
    },
    jobTemplate: {
      sourceType: 'docker_container',
      repositoryId: 'homelab-r2',
      schedule: '0 3 * * *',
      retention: { keepLast: 3, keepDaily: 7 },
      appHookDetection: 'auto',
    }
  }
]
```

**App hook auto-detection:** When `appHookDetection: 'auto'` is set,
BackupOS inspects the target (via the shared agent) before creating the
job to detect what databases are running:

```typescript
async function detectAppHooks(agentId: string, target: BackupTarget): Promise<AppHookConfig[]> {
  // For Docker containers: inspect container image name + env vars
  // postgres:* image → PostgresHook
  // mysql:* / mariadb:* → MySQLHook
  // redis:* → RedisHook
  // POSTGRES_DB env var present → PostgresHook
  // For VMs: check running processes via agent exec
  // `pgrep postgres` → PostgresHook
  // `pgrep mysqld` → MySQLHook
  // Returns detected hooks with sensible defaults
}
```

---

### The killer integrated workflow: safe updates

When Infra OS runs `ios update <service>`, it can trigger a BackupOS
pre-update snapshot before deploying. This is the workflow no other
tool delivers end-to-end:

```
ios update splice-worker --node dockee01

Infra OS update flow (extended for BackupOS integration):
┌────────────────────────────────────────────────────────────┐
│ 0. Check BackupOS integration enabled                       │
│                                                             │
│ 1. BackupOS: trigger pre-update snapshot                    │
│    → POST backupos/api/jobs/{id}/run                        │
│    → Wait for snapshot completion (max 5min)                │
│    → Store snapshotId in updateHistory.backupSnapshotId     │
│                                                             │
│ 2. Proxmox: take VM snapshot (existing behaviour)           │
│                                                             │
│ 3. Agent: docker pull + restart                             │
│                                                             │
│ 4. Health check (60s timeout)                               │
│                                                             │
│ 5a. PASS → mark success. Two rollback points available:     │
│     - Proxmox VM snapshot                                   │
│     - BackupOS Restic snapshot (offsite, separate repo)     │
│                                                             │
│ 5b. FAIL → rollback:                                        │
│     - Restore Proxmox VM snapshot (fast, local)             │
│     - BackupOS snapshot remains as offsite fallback         │
│     - Alert: "Update failed. Rolled back. BackupOS          │
│       snapshot abc123 retained at homelab-r2."              │
└────────────────────────────────────────────────────────────┘
```

The result: every update has two independent rollback points — a local
Proxmox snapshot and an offsite Restic snapshot. If the Proxmox node
itself fails during the update, the BackupOS snapshot is the safety net.

---

### Infra OS UI additions for BackupOS integration

```
# New pages in Infra OS web app (when BackupOS integration enabled):

app/(dashboard)/
├── backup/
│   ├── page.tsx           # Backup overview — per-node coverage map
│   │                      # Red nodes = no backup | Green = covered
│   ├── jobs/page.tsx      # Shortcut to BackupOS job list (iframe or redirect)
│   └── rules/page.tsx     # Auto-provisioning rules management

# Topology page additions:
# - Backup status badge per node (last run, size, status)
# - "No backup" drift badge for unprotected nodes
# - Backup coverage filter: show only unprotected nodes

# Node detail slide-in additions:
# - Backup tab: last 5 runs, snapshot list, restore button
# - "Create backup job" CTA if no job exists
```

### ios CLI additions

```
# Backup commands (when BackupOS integration configured)
ios backup status              # All nodes with backup coverage summary
ios backup run <node>          # Trigger a backup for a specific node
ios backup snapshot <node>     # Quick pre-update snapshot (no schedule)
ios backup restore <node>      # Launch restore wizard for a node
ios backup uncovered           # List all nodes with no backup job

# Integration config
ios integration add backupos \
  --url https://backupos.local \
  --token bos_xxx
```

---

## 19. Storage Health & Cost Analytics

### Cost model per backend

```typescript
// packages/engine/storage-cost.ts

export interface BackendPricing {
  storagePerGBMonth: number   // USD
  egressPerGB: number         // USD — critical differentiator
  putPer1000: number          // USD — API write cost
  getPer1000: number          // USD — API read cost
  minStorageDays?: number     // B2 has 1-day minimum
  currency: 'USD'
}

export const BACKEND_PRICING: Record<string, BackendPricing> = {
  'cloudflare-r2': {
    storagePerGBMonth: 0.015,
    egressPerGB: 0,           // ← zero egress, best for restores
    putPer1000: 0.0045,
    getPer1000: 0.00036,
  },
  'backblaze-b2': {
    storagePerGBMonth: 0.006, // ← cheapest storage
    egressPerGB: 0.01,
    putPer1000: 0.004,
    getPer1000: 0.004,
    minStorageDays: 1,
  },
  'aws-s3-standard': {
    storagePerGBMonth: 0.023,
    egressPerGB: 0.09,        // ← expensive egress
    putPer1000: 0.005,
    getPer1000: 0.0004,
  },
  'wasabi': {
    storagePerGBMonth: 0.0069,
    egressPerGB: 0,           // zero egress
    putPer1000: 0.0005,
    getPer1000: 0.0004,
    minStorageDays: 90,       // ← 90-day minimum retention
  },
  'hetzner-storage-box': {
    storagePerGBMonth: 0.0057, // ← cheapest overall for EU
    egressPerGB: 0,
    putPer1000: 0,
    getPer1000: 0,
  },
  'sftp-custom': {
    storagePerGBMonth: 0,     // user manages their own cost
    egressPerGB: 0,
    putPer1000: 0,
    getPer1000: 0,
  },
  'local': {
    storagePerGBMonth: 0,
    egressPerGB: 0,
    putPer1000: 0,
    getPer1000: 0,
  },
}

export function estimateMonthlyCost(
  repo: Repository,
  pricing: BackendPricing,
  avgMonthlyRestoreGB: number = 0,
): CostEstimate {
  const sizeGB = (repo.sizeBytes ?? 0) / 1e9
  const storage = sizeGB * pricing.storagePerGBMonth
  const egress = avgMonthlyRestoreGB * pricing.egressPerGB
  const puts = (repo.monthlyPutCount ?? 0) / 1000 * pricing.putPer1000
  const gets = (repo.monthlyGetCount ?? 0) / 1000 * pricing.getPer1000

  return {
    storageUSD: storage,
    egressUSD: egress,
    apiUSD: puts + gets,
    totalUSD: storage + egress + puts + gets,
    projectedAnnualUSD: (storage + puts + gets) * 12,
    // Restore cost is separate — shown as "cost to restore everything once"
    fullRestoreCostUSD: sizeGB * pricing.egressPerGB,
  }
}

export function recommendCheapestBackend(
  sizeGB: number,
  avgMonthlyRestoreGB: number,
  region: 'us' | 'eu' | 'global' = 'global',
): BackendRecommendation[] {
  // Ranks backends by total annual cost for this usage pattern
  // Flags: zero-egress providers, minimum retention gotchas
  // Returns sorted list with explanation per option
}
```

### DB schema additions for storage health

```typescript
export const repositoryMetrics = sqliteTable('repository_metrics', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').references(() => repositories.id),

  // Size tracking
  totalSizeBytes: integer('total_size_bytes'),
  uniqueSizeBytes: integer('unique_size_bytes'),   // deduplicated size
  compressionRatio: integer('compression_ratio'),  // stored as integer * 100

  // API call tracking (for cost estimation)
  monthlyPutCount: integer('monthly_put_count'),
  monthlyGetCount: integer('monthly_get_count'),

  // Growth tracking
  sizeGrowthBytes7d: integer('size_growth_bytes_7d'),
  sizeGrowthBytes30d: integer('size_growth_bytes_30d'),

  // Cost (computed, cached)
  estimatedMonthlyCostUSD: integer('estimated_monthly_cost_usd'), // cents
  estimatedFullRestoreCostUSD: integer('estimated_full_restore_cost_usd'),

  // Integrity
  lastCheckAt: integer('last_check_at', { mode: 'timestamp' }),
  lastCheckStatus: text('last_check_status'),      // 'ok' | 'errors'
  lastCheckErrorCount: integer('last_check_error_count'),

  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

export const storageAlerts = sqliteTable('storage_alerts', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').references(() => repositories.id),
  type: text('type').notNull(),
  // 'growth_spike'      — grew >20% in 7 days
  // 'cost_threshold'    — estimated cost exceeded user threshold
  // 'integrity_error'   — restic check found errors
  // 'no_recent_backup'  — no new snapshot in configured window
  // 'approaching_limit' — if user set a size/cost budget
  severity: text('severity'),                      // 'info' | 'warning' | 'critical'
  message: text('message').notNull(),
  detail: text('detail'),
  firedAt: integer('fired_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
})
```

### tRPC additions for storage health

```typescript
// packages/api/router.ts — additions

repositories: router({
  // ... existing routes ...

  health: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(/* current size, growth rate, cost estimate, integrity status */),

  costEstimate: authedProcedure
    .input(z.object({
      id: z.string(),
      avgMonthlyRestoreGB: z.number().optional(),
    }))
    .query(/* full cost breakdown for this repo */),

  costComparison: authedProcedure
    .input(z.object({ sizeGB: z.number(), avgMonthlyRestoreGB: z.number() }))
    .query(/* rank all backends by cost for this usage — recommendation engine */),

  growthHistory: authedProcedure
    .input(z.object({ id: z.string(), days: z.number().default(30) }))
    .query(/* daily size snapshots for charting */),

  storageAlerts: authedProcedure
    .query(/* all open storage alerts across all repos */),
}),

// Dashboard additions
dashboard: router({
  // ... existing routes ...
  storageSummary: authedProcedure.query(/*
    total storage across all repos,
    total estimated monthly cost,
    per-backend breakdown,
    cost trend (7d, 30d),
    cheapest alternative recommendation if savings > $5/mo
  */),
}),
```

### Storage health web app pages

```
apps/web/app/(dashboard)/
├── repositories/
│   ├── page.tsx               # Repo list — size, cost, integrity, growth badge
│   └── [id]/
│       ├── page.tsx           # Repo overview
│       ├── snapshots/page.tsx # Snapshot browser
│       ├── health/page.tsx    # NEW — integrity history, check runs
│       └── cost/page.tsx      # NEW — cost breakdown, growth chart,
│                              #       backend comparison table
├── storage/
│   └── page.tsx               # NEW — cross-repo storage overview
│                              #       total cost, growth trends,
│                              #       backend recommendation panel
```

### Storage cost display in dashboard

The dashboard storage panel expands from the simple bar chart in the mockup
to a full cost breakdown:

```
// Repository storage widget — expanded
┌─────────────────────────────────────────────────────────┐
│ // repository storage & cost                            │
│                                                         │
│ homelab-r2 (Cloudflare R2)                              │
│ ████████░░░░░░░░░░░░  221 GB / 1 TB                     │
│ ~$3.32/mo · $0 restore · +4.2 GB this week              │
│                                                         │
│ offsite-sftp (Hetzner Storage Box)                      │
│ ████░░░░░░░░░░░░░░░░  63 GB / 500 GB                    │
│ ~$0.36/mo · $0 restore · +1.1 GB this week              │
│                                                         │
│ Total: 284 GB · ~$3.68/mo · ~$44/yr                     │
│                                                         │
│ ✦ Recommendation: Switch homelab-r2 to Backblaze B2     │
│   Save ~$2.10/mo ($25/yr). Restore cost: $2.21 once.   │
└─────────────────────────────────────────────────────────┘
```

---

## 20. Updated V1 MVP Scope

### Build in V1 (updated)
- [ ] Agent: Linux + Windows (shared ios-agent v2 if Infra OS present)
- [ ] Restic repository management (S3, R2, B2, SFTP, local, all backends)
- [ ] Backup jobs: filesystem, Docker, Proxmox VM/LXC, Windows VSS
- [ ] App hooks: PostgreSQL, MySQL, Redis, SQLite
- [ ] YAML restore specs
- [ ] PBS + Borg monitors
- [ ] **Storage health: size tracking, growth rate, cost estimation**
- [ ] **Cost comparison engine: rank backends by total annual cost**
- [ ] **Storage alerts: growth spike, cost threshold, integrity errors**
- [ ] **Infra OS Layer 1: BackupOS API + Infra OS adapter**
- [ ] **Infra OS Layer 2: Shared ios-agent v2 (dual-purpose)**
- [ ] Email alerts
- [ ] Dashboard with storage cost panel
- [ ] Single Docker container

### Defer to V2
- [ ] **Infra OS Layer 3: Auto-provisioning rules** (needs Infra OS V3)
- [ ] **ios backup CLI commands** (needs Infra OS V3)
- [ ] **Safe update + BackupOS snapshot** workflow (needs Infra OS V3)
- [ ] XCP-ng / VMware drivers
- [ ] MongoDB hook
- [ ] Scheduled restore tests
- [ ] BackupOS Cloud
- [ ] Multi-user / Teams plan
