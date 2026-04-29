INSERT INTO logging_config (id, activity_retention, audit_retention, ops_retention)
VALUES ('singleton', '90d', '365d', '14d')
ON CONFLICT(id) DO NOTHING;
