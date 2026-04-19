CREATE TABLE `infra_os_services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`service_type` text NOT NULL,
	`host` text,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `infra_service_id` text REFERENCES infra_os_services(id);