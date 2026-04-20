ALTER TABLE `agents` ADD `update_channel` text DEFAULT 'stable';
ALTER TABLE `agents` ADD `hypervisor_driver` integer;
ALTER TABLE `agents` ADD `app_hooks_available` integer;
ALTER TABLE `agents` ADD `cpu_pct` integer;
ALTER TABLE `agents` ADD `ram_bytes` integer;
ALTER TABLE `agents` ADD `disk_read_bps` integer;
ALTER TABLE `agents` ADD `disk_write_bps` integer;
ALTER TABLE `agents` ADD `resource_history` text;
