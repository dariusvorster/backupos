-- Recreate backup_runs with ON DELETE SET NULL on all FK columns
CREATE TABLE `backup_runs_new` (
  `id`            text PRIMARY KEY NOT NULL,
  `job_id`        text REFERENCES `backup_jobs`(`id`) ON DELETE SET NULL,
  `agent_id`      text REFERENCES `agents`(`id`) ON DELETE SET NULL,
  `repository_id` text REFERENCES `repositories`(`id`) ON DELETE SET NULL,
  `status`        text NOT NULL,
  `trigger`       text NOT NULL,
  `snapshot_id`   text,
  `files_new`        integer,
  `files_changed`    integer,
  `files_unmodified` integer,
  `data_added`       integer,
  `total_size`       integer,
  `duration`         integer,
  `error_message` text,
  `error_detail`  text,
  `started_at`    integer NOT NULL,
  `completed_at`  integer,
  `log`           text,
  `phases`        text,
  `snapshots_removed` integer,
  `snapshots_kept`    integer
);
--> statement-breakpoint
INSERT INTO `backup_runs_new` SELECT * FROM `backup_runs`;
--> statement-breakpoint
DROP TABLE `backup_runs`;
--> statement-breakpoint
ALTER TABLE `backup_runs_new` RENAME TO `backup_runs`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `backup_runs_job_id_idx` ON `backup_runs` (`job_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `backup_runs_started_at_idx` ON `backup_runs` (`started_at`);
