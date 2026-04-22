CREATE TABLE `instance_settings` (
  `id` text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  `instance_name` text NOT NULL DEFAULT 'BackupOS',
  `timezone` text NOT NULL DEFAULT 'UTC',
  `language` text NOT NULL DEFAULT 'en',
  `date_format` text NOT NULL DEFAULT 'YYYY-MM-DD',
  `updated_at` integer
);

CREATE TABLE `smtp_config` (
  `id` text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  `host` text,
  `port` integer DEFAULT 587,
  `username` text,
  `password` text,
  `from_name` text NOT NULL DEFAULT 'BackupOS',
  `from_email` text,
  `tls` integer DEFAULT 1,
  `enabled` integer DEFAULT 0,
  `updated_at` integer
);

CREATE TABLE `api_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `token_hash` text NOT NULL,
  `token_prefix` text NOT NULL,
  `last_used_at` integer,
  `expires_at` integer,
  `created_at` integer NOT NULL
);

CREATE TABLE `backup_defaults` (
  `id` text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  `keep_last` integer DEFAULT 10,
  `keep_daily` integer DEFAULT 7,
  `keep_weekly` integer DEFAULT 4,
  `keep_monthly` integer DEFAULT 12,
  `keep_yearly` integer DEFAULT 0,
  `schedule_start` integer DEFAULT 0,
  `schedule_end` integer DEFAULT 23,
  `updated_at` integer
);
