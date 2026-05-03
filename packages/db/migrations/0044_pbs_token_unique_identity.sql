-- Migration: enforce unique (user, realm, token_name) on pbs_tokens
--
-- WARNING: if you have pre-existing duplicate identities from before this
-- migration, the CREATE UNIQUE INDEX below will fail. Deduplicate first:
--   DELETE FROM pbs_tokens WHERE rowid NOT IN (
--     SELECT MIN(rowid) FROM pbs_tokens GROUP BY user, realm, token_name
--   );

-- Normalise legacy permissions values to the canonical set {read, write, full}
-- before creating the index, so a future uniqueness check can't be confused by
-- differing case or synonyms.
UPDATE pbs_tokens SET permissions = 'read'  WHERE lower(permissions) IN ('read',  'readonly', 'ro');
UPDATE pbs_tokens SET permissions = 'write' WHERE lower(permissions) IN ('write', 'readwrite', 'rw');
UPDATE pbs_tokens SET permissions = 'full'  WHERE lower(permissions) IN ('full',  'admin', 'all');

CREATE UNIQUE INDEX IF NOT EXISTS pbs_tokens_user_realm_token_name_uniq
  ON pbs_tokens (user, realm, token_name);
