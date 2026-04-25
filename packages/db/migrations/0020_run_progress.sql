ALTER TABLE `backup_runs` ADD `progress_pct` real;
ALTER TABLE `backup_runs` ADD `bytes_done` integer;
ALTER TABLE `backup_runs` ADD `bytes_total` integer;
ALTER TABLE `backup_runs` ADD `files_done` integer;
ALTER TABLE `backup_runs` ADD `files_total` integer;
