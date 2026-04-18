CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hostname` text,
	`ip` text,
	`os_info` text,
	`platform` text,
	`arch` text,
	`vss_available` integer,
	`agent_version` text,
	`status` text DEFAULT 'disconnected',
	`last_seen_at` integer,
	`enrolled_at` integer NOT NULL,
	`public_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true,
	`last_fired_at` integer
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`resource_name` text,
	`actor` text DEFAULT 'system',
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`agent_id` text,
	`repository_id` text,
	`source_type` text NOT NULL,
	`source_config` text NOT NULL,
	`schedule` text NOT NULL,
	`enabled` integer DEFAULT true,
	`keep_last` integer,
	`keep_daily` integer,
	`keep_weekly` integer,
	`keep_monthly` integer,
	`keep_yearly` integer,
	`tags` text,
	`pre_hook` text,
	`post_hook` text,
	`last_run_at` integer,
	`last_run_status` text,
	`next_run_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `backup_monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`last_synced_at` integer,
	`status` text DEFAULT 'unknown',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`agent_id` text,
	`repository_id` text,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`snapshot_id` text,
	`files_new` integer,
	`files_changed` integer,
	`files_unmodified` integer,
	`data_added` integer,
	`total_size` integer,
	`duration` integer,
	`error_message` text,
	`error_detail` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `backup_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hypervisor_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'unknown',
	`last_synced_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hypervisor_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`node` text,
	`status` text,
	`os_type` text,
	`tags` text,
	`meta` text,
	`last_seen_at` integer,
	FOREIGN KEY (`integration_id`) REFERENCES `hypervisor_integrations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitor_results` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text,
	`status` text NOT NULL,
	`last_backup_at` integer,
	`last_backup_status` text,
	`size_bytes` integer,
	`details` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `backup_monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`backend` text NOT NULL,
	`config` text NOT NULL,
	`restic_password` text NOT NULL,
	`size_bytes` integer,
	`snapshot_count` integer,
	`last_checked_at` integer,
	`last_check_status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repository_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text,
	`total_size_bytes` integer,
	`unique_size_bytes` integer,
	`compression_ratio` integer,
	`monthly_put_count` integer,
	`monthly_get_count` integer,
	`size_growth_bytes_7d` integer,
	`size_growth_bytes_30d` integer,
	`estimated_monthly_cost_usd` integer,
	`estimated_full_restore_cost_usd` integer,
	`last_check_at` integer,
	`last_check_status` text,
	`last_check_error_count` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `restore_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text,
	`snapshot_id` text,
	`status` text NOT NULL,
	`log` text,
	`trigger` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`spec_id`) REFERENCES `restore_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `restore_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`yaml_content` text NOT NULL,
	`job_id` text,
	`repository_id` text,
	`last_validated_at` integer,
	`validation_status` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `backup_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text,
	`job_id` text,
	`hostname` text,
	`paths` text,
	`tags` text,
	`size_bytes` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `backup_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `storage_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text,
	`type` text NOT NULL,
	`severity` text,
	`message` text NOT NULL,
	`detail` text,
	`fired_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
