-- XCP-ng Phase 1 foundation tables
-- xcp_pools: registered XCP-ng pool masters
-- xcp_vms: VMs discovered via pool refresh
-- xcp_backup_chains: CBT chain state per VDI (Phase 2 data plane)

CREATE TABLE IF NOT EXISTS `xcp_pools` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `name`             TEXT NOT NULL,
  `pool_master_url`  TEXT NOT NULL,
  `username`         TEXT NOT NULL,
  `password_enc`     TEXT NOT NULL,
  `verify_ssl`       INTEGER DEFAULT 1,
  `cert_fingerprint` TEXT,
  `last_seen_at`     INTEGER,
  `last_test_status` TEXT,
  `last_test_error`  TEXT,
  `created_at`       INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `xcp_vms` (
  `uuid`           TEXT PRIMARY KEY NOT NULL,
  `pool_id`        TEXT NOT NULL REFERENCES `xcp_pools`(`id`) ON DELETE CASCADE,
  `name_label`     TEXT NOT NULL,
  `power_state`    TEXT NOT NULL,
  `host_uuid`      TEXT,
  `is_cbt_capable` INTEGER DEFAULT 0,
  `vdi_uuids_json` TEXT NOT NULL DEFAULT '[]',
  `last_seen_at`   INTEGER
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `xcp_vms_pool_id_idx` ON `xcp_vms` (`pool_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `xcp_backup_chains` (
  `vdi_uuid`            TEXT PRIMARY KEY NOT NULL,
  `last_snapshot_uuid`  TEXT,
  `last_bitmap_base`    TEXT,
  `last_backup_at`      INTEGER
);
