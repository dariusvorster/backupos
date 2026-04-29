CREATE TABLE `integration_tokens` (
  `id`              text PRIMARY KEY NOT NULL,
  `name`            text NOT NULL,
  `token_hash`      text NOT NULL UNIQUE,
  `token_prefix`    text NOT NULL,
  `scopes`          text NOT NULL,
  `expires_at`      integer,
  `created_at`      integer NOT NULL,
  `created_by`      text NOT NULL REFERENCES `user`(`id`),
  `last_used_at`    integer,
  `revoked_at`      integer,
  `rate_limit_rpm`  integer NOT NULL DEFAULT 60
);
--> statement-breakpoint
CREATE INDEX `integration_tokens_hash_idx` ON `integration_tokens` (`token_hash`);
