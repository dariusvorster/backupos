-- Migrate all timestamp columns from Unix seconds to Unix milliseconds.
-- Sentinel: any value < 1_000_000_000_000 was stored as seconds → multiply by 1000.

UPDATE agents SET last_seen_at = last_seen_at * 1000 WHERE last_seen_at IS NOT NULL AND last_seen_at < 1000000000000;
UPDATE agents SET enrolled_at = enrolled_at * 1000 WHERE enrolled_at < 1000000000000;

UPDATE repositories SET initialized_at = initialized_at * 1000 WHERE initialized_at IS NOT NULL AND initialized_at < 1000000000000;
UPDATE repositories SET last_checked_at = last_checked_at * 1000 WHERE last_checked_at IS NOT NULL AND last_checked_at < 1000000000000;
UPDATE repositories SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE infra_os_services SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE backup_jobs SET last_run_at = last_run_at * 1000 WHERE last_run_at IS NOT NULL AND last_run_at < 1000000000000;
UPDATE backup_jobs SET next_run_at = next_run_at * 1000 WHERE next_run_at IS NOT NULL AND next_run_at < 1000000000000;
UPDATE backup_jobs SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE backup_jobs SET last_preflight_at = last_preflight_at * 1000 WHERE last_preflight_at IS NOT NULL AND last_preflight_at < 1000000000000;

UPDATE backup_runs SET started_at = started_at * 1000 WHERE started_at < 1000000000000;
UPDATE backup_runs SET completed_at = completed_at * 1000 WHERE completed_at IS NOT NULL AND completed_at < 1000000000000;

UPDATE snapshots SET hold_expires_at = hold_expires_at * 1000 WHERE hold_expires_at IS NOT NULL AND hold_expires_at < 1000000000000;
UPDATE snapshots SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE restore_specs SET last_validated_at = last_validated_at * 1000 WHERE last_validated_at IS NOT NULL AND last_validated_at < 1000000000000;
UPDATE restore_specs SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE restore_runs SET started_at = started_at * 1000 WHERE started_at < 1000000000000;
UPDATE restore_runs SET completed_at = completed_at * 1000 WHERE completed_at IS NOT NULL AND completed_at < 1000000000000;

UPDATE backup_monitors SET last_synced_at = last_synced_at * 1000 WHERE last_synced_at IS NOT NULL AND last_synced_at < 1000000000000;
UPDATE backup_monitors SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE monitor_results SET last_backup_at = last_backup_at * 1000 WHERE last_backup_at IS NOT NULL AND last_backup_at < 1000000000000;
UPDATE monitor_results SET checked_at = checked_at * 1000 WHERE checked_at < 1000000000000;

UPDATE alert_rules SET last_fired_at = last_fired_at * 1000 WHERE last_fired_at IS NOT NULL AND last_fired_at < 1000000000000;

UPDATE audit_log SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE logs SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE logging_config SET updated_at = updated_at * 1000 WHERE updated_at IS NOT NULL AND updated_at < 1000000000000;

UPDATE hypervisor_integrations SET last_synced_at = last_synced_at * 1000 WHERE last_synced_at IS NOT NULL AND last_synced_at < 1000000000000;
UPDATE hypervisor_integrations SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE hypervisor_targets SET last_seen_at = last_seen_at * 1000 WHERE last_seen_at IS NOT NULL AND last_seen_at < 1000000000000;

UPDATE repository_metrics SET last_check_at = last_check_at * 1000 WHERE last_check_at IS NOT NULL AND last_check_at < 1000000000000;
UPDATE repository_metrics SET recorded_at = recorded_at * 1000 WHERE recorded_at < 1000000000000;

UPDATE storage_alerts SET fired_at = fired_at * 1000 WHERE fired_at < 1000000000000;
UPDATE storage_alerts SET resolved_at = resolved_at * 1000 WHERE resolved_at IS NOT NULL AND resolved_at < 1000000000000;

UPDATE alerts SET snoozed_until = snoozed_until * 1000 WHERE snoozed_until IS NOT NULL AND snoozed_until < 1000000000000;
UPDATE alerts SET fired_at = fired_at * 1000 WHERE fired_at < 1000000000000;
UPDATE alerts SET resolved_at = resolved_at * 1000 WHERE resolved_at IS NOT NULL AND resolved_at < 1000000000000;

UPDATE alert_channels SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE verification_tests SET last_run_at = last_run_at * 1000 WHERE last_run_at IS NOT NULL AND last_run_at < 1000000000000;
UPDATE verification_tests SET next_run_at = next_run_at * 1000 WHERE next_run_at IS NOT NULL AND next_run_at < 1000000000000;
UPDATE verification_tests SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE verification_runs SET started_at = started_at * 1000 WHERE started_at < 1000000000000;
UPDATE verification_runs SET completed_at = completed_at * 1000 WHERE completed_at IS NOT NULL AND completed_at < 1000000000000;

UPDATE bandwidth_profiles SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE "user" SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE "user" SET updated_at = updated_at * 1000 WHERE updated_at < 1000000000000;
UPDATE "user" SET phone_verified_at = phone_verified_at * 1000 WHERE phone_verified_at IS NOT NULL AND phone_verified_at < 1000000000000;

UPDATE session SET expires_at = expires_at * 1000 WHERE expires_at < 1000000000000;
UPDATE session SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE session SET updated_at = updated_at * 1000 WHERE updated_at < 1000000000000;

UPDATE account SET access_token_expires_at = access_token_expires_at * 1000 WHERE access_token_expires_at IS NOT NULL AND access_token_expires_at < 1000000000000;
UPDATE account SET refresh_token_expires_at = refresh_token_expires_at * 1000 WHERE refresh_token_expires_at IS NOT NULL AND refresh_token_expires_at < 1000000000000;
UPDATE account SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE account SET updated_at = updated_at * 1000 WHERE updated_at < 1000000000000;

UPDATE verification SET expires_at = expires_at * 1000 WHERE expires_at < 1000000000000;
UPDATE verification SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE verification SET updated_at = updated_at * 1000 WHERE updated_at IS NOT NULL AND updated_at < 1000000000000;

UPDATE two_factor SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE instance_settings SET updated_at = updated_at * 1000 WHERE updated_at IS NOT NULL AND updated_at < 1000000000000;

UPDATE smtp_config SET updated_at = updated_at * 1000 WHERE updated_at IS NOT NULL AND updated_at < 1000000000000;

UPDATE api_tokens SET last_used_at = last_used_at * 1000 WHERE last_used_at IS NOT NULL AND last_used_at < 1000000000000;
UPDATE api_tokens SET expires_at = expires_at * 1000 WHERE expires_at IS NOT NULL AND expires_at < 1000000000000;
UPDATE api_tokens SET created_at = created_at * 1000 WHERE created_at < 1000000000000;

UPDATE backup_defaults SET updated_at = updated_at * 1000 WHERE updated_at IS NOT NULL AND updated_at < 1000000000000;
