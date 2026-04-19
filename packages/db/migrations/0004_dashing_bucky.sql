ALTER TABLE `snapshots` ADD `pinned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `retention_hold` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `hold_reason` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `hold_expires_at` integer;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `custom_tags` text;