ALTER TABLE backup_runs ADD COLUMN last_heartbeat_at INTEGER;
ALTER TABLE backup_runs ADD COLUMN phase TEXT;
