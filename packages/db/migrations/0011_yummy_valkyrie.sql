CREATE TABLE `logging_config` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`activity_retention` text DEFAULT '90d' NOT NULL,
	`audit_retention` text DEFAULT '365d' NOT NULL,
	`ops_retention` text DEFAULT '14d' NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`component` text NOT NULL,
	`message` text NOT NULL,
	`payload` text,
	`entity_type` text,
	`entity_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logs_entity_idx` ON `logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `logs_created_at_idx` ON `logs` (`created_at`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `prev_hash` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `hash` text;--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
ALTER TABLE `repositories` ADD `group` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `raw_size_bytes` integer;--> statement-breakpoint
ALTER TABLE `repositories` ADD `replicas` text;