CREATE TABLE `alert_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text,
	`parent_id` text,
	`child_count` integer DEFAULT 0,
	`type` text NOT NULL,
	`severity` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`snoozed_until` integer,
	`fired_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backup_defaults` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`keep_last` integer DEFAULT 10,
	`keep_daily` integer DEFAULT 7,
	`keep_weekly` integer DEFAULT 4,
	`keep_monthly` integer DEFAULT 12,
	`keep_yearly` integer DEFAULT 0,
	`schedule_start` integer DEFAULT 0,
	`schedule_end` integer DEFAULT 23,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `instance_settings` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`instance_name` text DEFAULT 'BackupOS' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`date_format` text DEFAULT 'YYYY-MM-DD' NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_unique` ON `invite` (`token`);--> statement-breakpoint
CREATE TABLE `smtp_config` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`host` text,
	`port` integer DEFAULT 587,
	`username` text,
	`password` text,
	`from_name` text DEFAULT 'BackupOS' NOT NULL,
	`from_email` text,
	`tls` integer DEFAULT true,
	`enabled` integer DEFAULT false,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `update_channel` text DEFAULT 'stable';--> statement-breakpoint
ALTER TABLE `agents` ADD `hypervisor_driver` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `app_hooks_available` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `cpu_pct` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `ram_bytes` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `disk_read_bps` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `disk_write_bps` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `resource_history` text;--> statement-breakpoint
ALTER TABLE `alert_rules` ADD `channel_id` text;--> statement-breakpoint
ALTER TABLE `backup_monitors` ADD `group` text;