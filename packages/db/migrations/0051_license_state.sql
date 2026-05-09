CREATE TABLE IF NOT EXISTS `license_state` (
  `id`          text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  `tier`        text NOT NULL DEFAULT 'free',
  `license_key` text,
  `expires_at`  integer,
  `updated_at`  integer NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `license_state` (`id`, `tier`, `updated_at`) VALUES ('singleton', 'free', unixepoch() * 1000);
