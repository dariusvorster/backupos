CREATE TABLE `pbs_datastores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	`prune_schedule` text,
	`gc_schedule` text,
	`last_gc_at` integer,
	`total_size_bytes` integer,
	`unique_size_bytes` integer,
	`chunk_count` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pbs_datastores_name_unique` ON `pbs_datastores` (`name`);
--> statement-breakpoint
CREATE TABLE `pbs_namespaces` (
	`id` text PRIMARY KEY NOT NULL,
	`datastore_id` text REFERENCES pbs_datastores(id),
	`path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pbs_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`datastore_id` text REFERENCES pbs_datastores(id),
	`namespace_id` text REFERENCES pbs_namespaces(id),
	`backup_type` text NOT NULL,
	`backup_id` text NOT NULL,
	`backup_time` integer NOT NULL,
	`finished_at` integer,
	`manifest` text,
	`total_size_bytes` integer,
	`unique_size_bytes` integer,
	`protected` integer DEFAULT false,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `pbs_chunk_refs` (
	`digest` text NOT NULL,
	`snapshot_id` text REFERENCES pbs_snapshots(id),
	`archive_name` text NOT NULL,
	`ref_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pbs_chunk_refs_digest_snapshot_idx` ON `pbs_chunk_refs` (`digest`,`snapshot_id`);
--> statement-breakpoint
CREATE INDEX `pbs_chunk_refs_digest_idx` ON `pbs_chunk_refs` (`digest`);
--> statement-breakpoint
CREATE TABLE `pbs_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`datastore_id` text REFERENCES pbs_datastores(id),
	`user` text NOT NULL,
	`realm` text NOT NULL,
	`token_name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`permissions` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `pbs_active_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text REFERENCES pbs_tokens(id),
	`datastore_id` text REFERENCES pbs_datastores(id),
	`backup_type` text NOT NULL,
	`backup_id` text NOT NULL,
	`backup_time` integer NOT NULL,
	`started_at` integer NOT NULL,
	`state` text NOT NULL,
	`scratch_path` text
);
--> statement-breakpoint
CREATE TABLE `pbs_active_writes` (
	`wid` text PRIMARY KEY NOT NULL,
	`session_id` text REFERENCES pbs_active_sessions(id),
	`archive_name` text NOT NULL,
	`index_type` text NOT NULL,
	`chunk_size` integer,
	`total_size` integer,
	`digest_list` text,
	`size_list` text
);
