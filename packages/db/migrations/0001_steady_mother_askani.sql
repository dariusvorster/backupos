CREATE TABLE `bandwidth_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_global` integer DEFAULT false,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bandwidth_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`start_hour` integer NOT NULL,
	`end_hour` integer NOT NULL,
	`limit_kbps` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `bandwidth_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`test_id` text,
	`status` text NOT NULL,
	`log` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`test_id`) REFERENCES `verification_tests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`job_id` text,
	`target_type` text NOT NULL,
	`target_config` text,
	`validation_hook` text,
	`schedule` text,
	`enabled` integer DEFAULT true,
	`last_result` text,
	`last_run_at` integer,
	`next_run_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `backup_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `bandwidth_profile_id` text;