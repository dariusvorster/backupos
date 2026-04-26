ALTER TABLE repositories ADD COLUMN initialized_at INTEGER;
-- Backfill: any repo that has been successfully checked is already initialized
UPDATE repositories SET initialized_at = COALESCE(last_checked_at, created_at) WHERE last_check_status = 'ok';
