ALTER TABLE `backup_jobs` ADD `preflight_enabled` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `last_preflight_at` integer;--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `last_preflight_status` text;