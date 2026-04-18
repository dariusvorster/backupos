PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_backup_jobs` (
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
	`bandwidth_profile_id` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bandwidth_profile_id`) REFERENCES `bandwidth_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_backup_jobs`("id", "name", "agent_id", "repository_id", "source_type", "source_config", "schedule", "enabled", "keep_last", "keep_daily", "keep_weekly", "keep_monthly", "keep_yearly", "tags", "pre_hook", "post_hook", "last_run_at", "last_run_status", "next_run_at", "created_at", "bandwidth_profile_id") SELECT "id", "name", "agent_id", "repository_id", "source_type", "source_config", "schedule", "enabled", "keep_last", "keep_daily", "keep_weekly", "keep_monthly", "keep_yearly", "tags", "pre_hook", "post_hook", "last_run_at", "last_run_status", "next_run_at", "created_at", "bandwidth_profile_id" FROM `backup_jobs`;--> statement-breakpoint
DROP TABLE `backup_jobs`;--> statement-breakpoint
ALTER TABLE `__new_backup_jobs` RENAME TO `backup_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;