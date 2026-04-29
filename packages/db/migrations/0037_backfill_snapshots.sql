-- Backfill snapshots table from existing successful backup_runs.
-- paths stored as NULL for backfilled rows (sourceConfig is an object, not a plain array;
-- new backups from server.ts will have proper paths going forward).
INSERT INTO snapshots (id, repository_id, job_id, hostname, paths, tags, size_bytes, created_at)
SELECT
  br.snapshot_id,
  bj.repository_id,
  br.job_id,
  a.hostname,
  NULL,
  NULL,
  br.total_size,
  COALESCE(br.completed_at, br.started_at)
FROM backup_runs br
LEFT JOIN backup_jobs bj ON bj.id = br.job_id
LEFT JOIN agents a ON a.id = bj.agent_id
WHERE br.status = 'success'
  AND br.snapshot_id IS NOT NULL
  AND br.snapshot_id != ''
ON CONFLICT(id) DO NOTHING;
