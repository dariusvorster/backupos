-- Backfill: normalise pbs_tokens.permissions values that 0044 missed.
--
-- 0044 normalised {full, admin, all} → 'full', but missed the literal
-- 'full access' string used by older UI versions. It also missed
-- 'read+write' and similar synonyms. This migration cleans up anything
-- that didn't match the canonical set, with a final catch-all that
-- collapses unknowns to 'read' (safe default).

UPDATE pbs_tokens SET permissions = 'full'
  WHERE lower(permissions) IN ('full access', 'fullaccess', 'full_access');

UPDATE pbs_tokens SET permissions = 'write'
  WHERE lower(permissions) IN ('read+write', 'read write', 'read_write');

-- Catch-all: anything that isn't already in {read, write, full} becomes 'read'.
UPDATE pbs_tokens SET permissions = 'read'
  WHERE permissions NOT IN ('read', 'write', 'full');
