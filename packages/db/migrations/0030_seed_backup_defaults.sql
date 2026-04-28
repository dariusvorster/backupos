INSERT INTO backup_defaults (id, keep_last, keep_daily, keep_weekly, keep_monthly, keep_yearly, schedule_start, schedule_end)
VALUES ('singleton', 10, 7, 4, 12, 0, 0, 23)
ON CONFLICT(id) DO NOTHING;
