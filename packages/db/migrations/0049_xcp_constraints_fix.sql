DROP TABLE IF EXISTS `xcp_backup_chains`;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `xcp_backup_chains` (
  `job_id`              TEXT NOT NULL,
  `vdi_uuid`            TEXT NOT NULL,
  `last_snapshot_uuid`  TEXT,
  `last_bitmap_base`    TEXT,
  `last_backup_at`      INTEGER,
  PRIMARY KEY (`job_id`, `vdi_uuid`)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `xcp_pools_pool_master_url_idx` ON `xcp_pools` (`pool_master_url`);
