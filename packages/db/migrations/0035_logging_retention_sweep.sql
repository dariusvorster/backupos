ALTER TABLE `logging_config` ADD `last_sweep_at` integer;
--> statement-breakpoint
ALTER TABLE `logging_config` ADD `last_sweep_deleted_alerts` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `logging_config` ADD `last_sweep_deleted_audit` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `logging_config` ADD `last_sweep_deleted_ops` integer DEFAULT 0;
