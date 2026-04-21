CREATE TABLE `alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_id` text,
  `parent_id` text,
  `child_count` integer DEFAULT 0,
  `type` text NOT NULL,
  `severity` text,
  `message` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `snoozed_until` integer,
  `fired_at` integer NOT NULL,
  `resolved_at` integer
);

CREATE TABLE `alert_channels` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `config` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);

ALTER TABLE `alert_rules` ADD `channel_id` text;
